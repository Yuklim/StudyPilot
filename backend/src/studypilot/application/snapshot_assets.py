"""Short-lived transactions for snapshot assets; bytes land before the row does.

Ordering is the whole design here. The image is promoted into the controlled
directory *before* its row exists, so an interruption can only ever leave
unreferenced bytes — which the existing 24-hour sweep collects — and never a row
pointing at a file that is not there. Assets have no PENDING state and no
reconciliation to recover from the opposite mistake.
"""

from collections.abc import Callable
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from studypilot.application.files import FileService
from studypilot.infrastructure.database import create_database_engine, create_session_factory
from studypilot.infrastructure.database.asset_store import AssetStore, project
from studypilot.infrastructure.database.models import SnapshotAsset
from studypilot.modules.resources.assets import (
    AssetRecord,
    AssetStorage,
    AssetUpload,
)
from studypilot.modules.resources.contracts import ResourceError


def transaction[T](operation: Callable[[Session], T]) -> T:
    engine = create_database_engine()
    try:
        with create_session_factory(engine).begin() as session:
            result = operation(session)
        return result
    finally:
        engine.dispose()


def detach(row: SnapshotAsset) -> AssetRecord:
    return AssetRecord(
        row.id,
        row.snapshot_id,
        row.source_url,
        row.media_type,
        row.size_bytes,
        row.sha256,
        row.storage_key,
        row.created_at,
    )


class AssetService:
    """Shares the file service's lock and staging set, not its table.

    Staging goes through `FileService.begin`, which registers the key as active so
    the orphan sweep cannot delete a file that is still being written.
    """

    def __init__(self, files: FileService, storage: AssetStorage) -> None:
        self.files = files
        self.storage = storage

    def precondition(self, resource_id: UUID, expected: int) -> None:
        """Refuse before a single byte is read from the request body."""

        transaction(lambda session: AssetStore(session).writable_snapshot(resource_id, expected))

    def create(
        self, resource_id: UUID, command: AssetUpload, key: str, streamed_digest: str, expected: int
    ) -> dict[str, Any]:
        content = self.storage.inspect_image(key)
        if content.sha256 != streamed_digest:
            # The staged file changed between streaming and inspection.
            raise ResourceError("UNKNOWN_ERROR", 500)

        def register(session: Session) -> tuple[dict[str, Any], bool]:
            store = AssetStore(session)
            snapshot = store.writable_snapshot(resource_id, expected)
            existing = store.by_source(snapshot.id, command.source_url)
            if existing is not None:
                # Same image, same place in the same text: one row, one copy.
                return project(existing), False
            return project(store.register(snapshot.id, command.source_url, content)), True

        with self.files.lock:
            self.storage.promote(key, content.storage_key, content.size_bytes, content.sha256)
            try:
                payload, stored = transaction(register)
            except Exception:
                self.storage.discard(content.storage_key)
                raise
            if not stored:
                self.storage.discard(content.storage_key)
            return payload

    def listing(self, resource_id: UUID) -> list[dict[str, Any]]:
        return transaction(lambda session: AssetStore(session).listing(resource_id))

    def download(self, resource_id: UUID, asset_id: UUID) -> tuple[AssetRecord, bytes]:
        row = transaction(lambda session: detach(AssetStore(session).get(resource_id, asset_id)))
        with self.files.lock:
            # Verified against the recorded size and digest: half a file is never
            # returned as if it were the frozen image.
            return row, self.storage.read(row.storage_key, row.size_bytes, row.sha256)

    def remove(self, resource_id: UUID, asset_id: UUID, expected: int) -> None:
        key = transaction(
            lambda session: AssetStore(session).remove(resource_id, asset_id, expected)
        )
        self.isolate([key])

    def isolate(self, keys: list[str]) -> None:
        """Move bytes whose rows are gone into the trash area.

        Called after the row is already deleted, so the bytes are unreferenced from
        this moment on: if isolation fails, the sweep collects them anyway.
        """

        with self.files.lock:
            for key in keys:
                self.storage.quarantine(key)
