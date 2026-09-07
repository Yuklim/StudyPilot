"""Disposable SQLAlchemy transactions for original-file lifecycle."""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from studypilot.infrastructure.database import create_database_engine, create_session_factory
from studypilot.infrastructure.database.models import OriginalFile, SnapshotAsset
from studypilot.infrastructure.database.resource_store import ResourceStore
from studypilot.modules.resources.contracts import FileCreate, ResourceError
from studypilot.modules.resources.files import FileContent, trash_key


@dataclass(frozen=True)
class FileRecord:
    id: UUID
    resource_id: UUID
    original_name: str
    size_bytes: int
    media_type: str
    sha256: str
    staging_key: str | None
    storage_key: str
    status: str
    failure_code: str | None
    created_at: datetime


def snapshot(row: OriginalFile) -> FileRecord:
    return FileRecord(**{name: getattr(row, name) for name in FileRecord.__dataclass_fields__})


class FileRepository:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def available(self) -> bool:
        # Startup must not create a database, tables, or directories.
        url = make_url(self.database_url)
        return bool(
            url.get_backend_name() == "sqlite"
            and url.database not in {None, "", ":memory:"}
            and Path(str(url.database)).expanduser().is_file()
        )

    @contextmanager
    def transaction(self) -> Iterator[Session]:
        engine = create_database_engine(self.database_url)
        try:
            with create_session_factory(engine).begin() as session:
                yield session
        finally:
            engine.dispose()

    def register(self, command: FileCreate, content: FileContent) -> FileRecord:
        with self.transaction() as session:
            store = ResourceStore(session)
            store.validate_taxonomy(command.topic_id, command.tag_ids)
            resource_id = store.insert_resource(command)
            store.initialize_progress(resource_id)
            store.attach_tags(resource_id, command.tag_ids)
            row = OriginalFile(resource_id=resource_id, status="PENDING", **asdict(content))
            session.add(row)
            session.flush()
            result = snapshot(row)
        return result

    def get(self, identity: UUID) -> FileRecord:
        with self.transaction() as session:
            row = session.get(OriginalFile, identity)
            if row is None:
                raise ResourceError("FILE_NOT_FOUND", 404)
            return snapshot(row)

    def records(self) -> list[FileRecord]:
        with self.transaction() as session:
            return [snapshot(row) for row in session.scalars(select(OriginalFile))]

    def references(self) -> set[str]:
        """Every key the sweep must leave alone, across both tables that own bytes.

        Snapshot assets share the controlled directory with uploaded originals, so
        omitting them here would not be a missing feature: their files would simply
        disappear 24 hours after upload, rows intact and nothing logged.
        """

        keys: set[str] = set()
        for row in self.records():
            keys.update((row.storage_key, trash_key(row.storage_key)))
            if row.staging_key:
                keys.add(row.staging_key)
        with self.transaction() as session:
            for key in session.scalars(select(SnapshotAsset.storage_key)):
                keys.update((key, trash_key(key)))
        return keys

    def transition(self, identity: UUID, status: str, code: str | None = None) -> None:
        with self.transaction() as session:
            row = session.get(OriginalFile, identity)
            if row is None:
                raise ResourceError("FILE_NOT_FOUND", 404)
            if row.status == status:
                return
            if (row.status, status) not in {
                ("PENDING", "FAILED"),
                ("READY", "FAILED"),
            }:
                raise ResourceError("FILE_STATE_UNAVAILABLE", 409)
            row.status = status
            row.failure_code = code

    def ready(self, identity: UUID, verify: Callable[[FileRecord], object]) -> None:
        with self.transaction() as session:
            row = session.get(OriginalFile, identity)
            if row is None:
                raise ResourceError("FILE_NOT_FOUND", 404)
            if row.status != "PENDING":
                raise ResourceError("FILE_STATE_UNAVAILABLE", 409)
            # Verify within the second transaction, before READY can commit.
            verify(snapshot(row))
            row.status = "READY"
            row.staging_key = None

    def detail(self, resource_id: UUID) -> dict[str, Any]:
        with self.transaction() as session:
            return {"data": ResourceStore(session).detail(resource_id)}
