"""Short-lived transactions for a resource's citation; never replay a write."""

from collections.abc import Callable
from typing import Any
from uuid import UUID

from sqlalchemy.orm.exc import StaleDataError

from studypilot.infrastructure.database import create_database_engine, create_session_factory
from studypilot.infrastructure.database.citation_store import CitationStore
from studypilot.modules.citations.contracts import CitationError, CitationPut


def transaction[T](operation: Callable[[CitationStore], T]) -> T:
    engine = create_database_engine()
    try:
        with create_session_factory(engine).begin() as session:
            result = operation(CitationStore(session))
        return result
    finally:
        engine.dispose()


def detail(resource_id: UUID) -> dict[str, Any]:
    return {"data": transaction(lambda store: store.detail(resource_id))}


def put(resource_id: UUID, command: CitationPut) -> tuple[dict[str, Any], bool]:
    try:
        data, created = transaction(lambda store: store.put(resource_id, command))
        return {"data": data}, created
    except StaleDataError:
        raise _conflict(resource_id) from None


def remove(resource_id: UUID, expected: int) -> None:
    try:
        transaction(lambda store: store.delete(resource_id, expected))
    except StaleDataError:
        raise _conflict(resource_id) from None


def _conflict(resource_id: UUID) -> CitationError:
    """Classify a lost race through fresh state; the failed write is never replayed."""

    def read(store: CitationStore) -> int | None:
        record = store.find(resource_id)
        return None if record is None else record.version

    current = transaction(read)
    return CitationError(
        "VERSION_CONFLICT", 409, None if current is None else {"current_version": current}
    )
