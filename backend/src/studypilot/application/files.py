"""Coordinate upload/recovery; single-process lock excludes active-upload GC."""

import asyncio
import logging
from contextlib import suppress
from datetime import UTC, datetime, timedelta
from threading import RLock
from typing import Any, BinaryIO
from uuid import UUID

from starlette.concurrency import run_in_threadpool

from studypilot.infrastructure.database.file_store import FileRecord, FileRepository
from studypilot.modules.resources.contracts import FileCreate, ResourceError
from studypilot.modules.resources.files import FileStorage, trash_key

logger = logging.getLogger(__name__)


class FileService:
    def __init__(self, repository: FileRepository, storage: FileStorage) -> None:
        self.repository = repository
        self.storage = storage
        self.lock = RLock()
        self.active: set[str] = set()

    def begin(self) -> tuple[str, BinaryIO]:
        with self.lock:
            key, stream = self.storage.begin()
            self.active.add(key)
            return key, stream

    def release(self, key: str, *, registered: bool = False) -> None:
        with self.lock:
            try:
                if not registered:
                    # May be an ambiguous failed commit. Never delete a registered
                    # stage; if the DB cannot answer, leave it for later safe GC.
                    if self.repository.available() and key in self.repository.references():
                        return
                    self.storage.discard(key)
            except Exception:
                logger.warning("FILE_TEMP_CLEANUP_DEFERRED")
            finally:
                self.active.discard(key)

    def create(
        self, command: FileCreate, key: str, name: str, declared: str, streamed_digest: str
    ) -> dict[str, Any]:
        content = self.storage.inspect(key, name, declared)
        if content.sha256 != streamed_digest:
            raise ResourceError("UNKNOWN_ERROR", 500)
        with self.lock:
            row = self.repository.register(command, content)
            self.storage.promote(key, row.storage_key, row.size_bytes, row.sha256)
            self.repository.ready(row.id, self._verify)
            return self.repository.detail(row.resource_id)

    def _verify(self, row: FileRecord) -> bytes:
        return self.storage.read(row.storage_key, row.size_bytes, row.sha256)

    def _fail(self, row: FileRecord, code: str = "FILE_CORRUPTED") -> None:
        # Persist refusal first. Failed quarantine must never restore availability.
        self.repository.transition(row.id, "FAILED", code)
        self.storage.quarantine(row.storage_key)

    def download(self, identity: UUID) -> tuple[FileRecord, bytes]:
        with self.lock:
            row = self.repository.get(identity)
            if row.status != "READY":
                code = (
                    "FILE_CORRUPTED"
                    if row.failure_code == "FILE_CORRUPTED"
                    else "FILE_STATE_UNAVAILABLE"
                )
                raise ResourceError(code, 409)
            try:
                if not self.storage.exists(row.storage_key):
                    self._restore_trash(row)
                data = self.storage.read(row.storage_key, row.size_bytes, row.sha256)
            except ResourceError as error:
                if error.code == "FILE_CORRUPTED":
                    self._fail(row)
                raise
            # A verified bounded snapshot avoids reopening a mutable path after hashing.
            return row, data

    def _restore_trash(self, row: FileRecord) -> None:
        key = trash_key(row.storage_key)
        if self.storage.exists(key):
            self.storage.promote(key, row.storage_key, row.size_bytes, row.sha256)
        else:
            raise ResourceError("FILE_CORRUPTED", 409)

    def _repair(self, row: FileRecord, now: datetime) -> None:
        if row.status == "FAILED" or row.staging_key in self.active:
            return
        if row.status == "PENDING" and now - row.created_at > timedelta(minutes=10):
            self._fail(row, "FILE_PENDING_TIMEOUT")
            return
        try:
            if not self.storage.exists(row.storage_key):
                if row.status == "PENDING" and row.staging_key:
                    if self.storage.exists(row.staging_key):
                        self.storage.promote(
                            row.staging_key, row.storage_key, row.size_bytes, row.sha256
                        )
                    else:
                        raise ResourceError("FILE_CORRUPTED", 409)
                else:
                    self._restore_trash(row)
            self.storage.read(row.storage_key, row.size_bytes, row.sha256)
            if row.status == "PENDING":
                self.repository.ready(row.id, self._verify)
        except ResourceError as error:
            if error.code != "FILE_CORRUPTED":
                raise
            self._fail(row)

    def reconcile(self, now: datetime | None = None) -> None:
        now = now or datetime.now(UTC)
        with self.lock:
            if not self.repository.available():
                return
            for row in self.repository.records():
                self._repair(row, now)
            for key in self.storage.orphans(now - timedelta(hours=24)):
                # Recheck under the same writer lock immediately before deletion.
                if key not in self.active and key not in self.repository.references():
                    self.storage.discard(key)

    def maintain(self) -> None:
        try:
            self.reconcile()
        except Exception:
            # Startup/health remains available; never log paths, SQL, or user data.
            logger.warning("FILE_RECONCILIATION_DEFERRED")

    async def periodic(self) -> None:
        while True:
            await asyncio.sleep(60)
            await run_in_threadpool(self.maintain)

    async def stop(self, task: asyncio.Task[None]) -> None:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
