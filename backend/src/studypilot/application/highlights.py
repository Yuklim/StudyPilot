"""Commit before returning; never retry a highlight mutation."""

from collections.abc import Callable
from typing import Any
from uuid import UUID

from sqlalchemy.orm.exc import StaleDataError

from studypilot.infrastructure.database import create_database_engine, create_session_factory
from studypilot.infrastructure.database.highlight_store import HighlightStore
from studypilot.modules.highlights.contracts import (
    HighlightCreate,
    HighlightError,
    HighlightPatch,
    HighlightQuery,
)


def transaction[T](operation: Callable[[HighlightStore], T]) -> T:
    engine = create_database_engine()
    try:
        with create_session_factory(engine).begin() as session:
            result = operation(HighlightStore(session))
        return result
    finally:
        engine.dispose()


def create(resource_id: UUID, command: HighlightCreate) -> dict[str, Any]:
    return {"data": transaction(lambda store: store.create(resource_id, command))}


def detail(resource_id: UUID, highlight_id: UUID) -> dict[str, Any]:
    return {"data": transaction(lambda store: store.detail(resource_id, highlight_id))}


def page(resource_id: UUID, query: HighlightQuery) -> dict[str, Any]:
    return transaction(lambda store: store.page(resource_id, query))


def mutate[T](
    resource_id: UUID, highlight_id: UUID, expected: int, operation: Callable[[HighlightStore], T]
) -> T:
    try:
        return transaction(operation)
    except StaleDataError:
        # A fresh read classifies the race; the failed write is never replayed.
        transaction(
            lambda store: store.check_version(store.find(resource_id, highlight_id), expected)
        )
        raise HighlightError("UNKNOWN_ERROR", 500) from None


def rebind(resource_id: UUID, highlight_id: UUID, command: HighlightPatch) -> dict[str, Any]:
    return {
        "data": mutate(
            resource_id,
            highlight_id,
            command.expected_version,
            lambda store: store.rebind(
                resource_id, highlight_id, command.note_id, command.expected_version
            ),
        )
    }


def delete(resource_id: UUID, highlight_id: UUID, expected: int) -> None:
    mutate(
        resource_id,
        highlight_id,
        expected,
        lambda store: store.delete(resource_id, highlight_id, expected),
    )
