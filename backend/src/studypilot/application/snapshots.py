"""Short-lived transactions for content snapshots; never replay a write."""

from collections.abc import Callable
from typing import Any
from uuid import UUID

from sqlalchemy.orm.exc import StaleDataError

from studypilot.infrastructure.database import create_database_engine, create_session_factory
from studypilot.infrastructure.database.snapshot_store import SnapshotStore
from studypilot.modules.resources.contracts import ResourceError
from studypilot.modules.resources.snapshots import SnapshotPut


def transaction[T](operation: Callable[[SnapshotStore], T]) -> T:
    engine = create_database_engine()
    try:
        with create_session_factory(engine).begin() as session:
            result = operation(SnapshotStore(session))
        return result
    finally:
        engine.dispose()


def detail(resource_id: UUID) -> dict[str, Any]:
    return {"data": transaction(lambda store: store.detail(resource_id))}


def put(resource_id: UUID, command: SnapshotPut) -> tuple[dict[str, Any], bool]:
    try:
        data, created = transaction(lambda store: store.put(resource_id, command))
        return {"data": data}, created
    except StaleDataError:
        # Classify a lost race through fresh state; never replay the write.
        raise ResourceError("VERSION_CONFLICT", 409, _current_version(resource_id)) from None


def remove(resource_id: UUID, expected: int) -> None:
    try:
        transaction(lambda store: store.delete(resource_id, expected))
    except StaleDataError:
        raise ResourceError("VERSION_CONFLICT", 409, _current_version(resource_id)) from None


def _current_version(resource_id: UUID) -> int | None:
    def read(store: SnapshotStore) -> int | None:
        record = store.find(resource_id)
        return None if record is None else record.version

    return transaction(read)
