"""Short-lived transactions for content snapshots; never replay a write."""

from collections.abc import Callable
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from studypilot.application.snapshot_assets import AssetService
from studypilot.infrastructure.database import create_database_engine, create_session_factory
from studypilot.infrastructure.database.asset_store import AssetStore
from studypilot.infrastructure.database.snapshot_store import SnapshotStore
from studypilot.modules.resources.contracts import ResourceError
from studypilot.modules.resources.snapshots import SnapshotPut


def session_transaction[T](operation: Callable[[Session], T]) -> T:
    engine = create_database_engine()
    try:
        with create_session_factory(engine).begin() as session:
            result = operation(session)
        return result
    finally:
        engine.dispose()


def transaction[T](operation: Callable[[SnapshotStore], T]) -> T:
    return session_transaction(lambda session: operation(SnapshotStore(session)))


def _drop_assets(session: Session, resource_id: UUID) -> list[str]:
    """Rows for the images of the text about to disappear, in the same transaction.

    Returns the storage keys the caller must isolate afterwards. Deleting the rows
    is not enough: a CASCADE removes rows, never the bytes on disk.
    """

    record = SnapshotStore(session).find(resource_id)
    return [] if record is None else AssetStore(session).purge(record.id)


def detail(resource_id: UUID) -> dict[str, Any]:
    return {"data": transaction(lambda store: store.detail(resource_id))}


def put(
    resource_id: UUID, command: SnapshotPut, assets: AssetService
) -> tuple[dict[str, Any], bool]:
    """Replacing the text discards its images: they belonged to the old copy."""

    def write(session: Session) -> tuple[dict[str, Any], bool, list[str]]:
        # Purge first, then write: if the write refuses, the whole transaction
        # rolls back and the existing assets are untouched.
        keys = _drop_assets(session, resource_id)
        data, created = SnapshotStore(session).put(resource_id, command)
        return data, created, keys

    try:
        data, created, keys = session_transaction(write)
        assets.isolate(keys)
        return {"data": data}, created
    except StaleDataError:
        # Classify a lost race through fresh state; never replay the write.
        raise ResourceError("VERSION_CONFLICT", 409, _current_version(resource_id)) from None


def remove(resource_id: UUID, expected: int, assets: AssetService) -> None:
    def write(session: Session) -> list[str]:
        keys = _drop_assets(session, resource_id)
        SnapshotStore(session).delete(resource_id, expected)
        return keys

    try:
        assets.isolate(session_transaction(write))
    except StaleDataError:
        raise ResourceError("VERSION_CONFLICT", 409, _current_version(resource_id)) from None


def _current_version(resource_id: UUID) -> int | None:
    def read(store: SnapshotStore) -> int | None:
        record = store.find(resource_id)
        return None if record is None else record.version

    return transaction(read)
