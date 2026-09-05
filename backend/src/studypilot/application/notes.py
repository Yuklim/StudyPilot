"""Commit before returning; never retry a personal-note mutation."""

from collections.abc import Callable
from typing import Any
from uuid import UUID

from sqlalchemy.orm.exc import StaleDataError

from studypilot.infrastructure.database import create_database_engine, create_session_factory
from studypilot.infrastructure.database.note_store import NoteStore
from studypilot.modules.notes.contracts import NoteCreate, NoteError, NotePatch, NoteQuery


def transaction[T](operation: Callable[[NoteStore], T]) -> T:
    engine = create_database_engine()
    try:
        with create_session_factory(engine).begin() as session:
            result = operation(NoteStore(session))
        return result
    finally:
        engine.dispose()


def create(resource_id: UUID, command: NoteCreate) -> dict[str, Any]:
    return {"data": transaction(lambda store: store.create(resource_id, command.content))}


def detail(resource_id: UUID, note_id: UUID) -> dict[str, Any]:
    return {"data": transaction(lambda store: store.detail(resource_id, note_id))}


def page(resource_id: UUID, query: NoteQuery) -> dict[str, Any]:
    return transaction(lambda store: store.page(resource_id, query))


def mutate[T](
    resource_id: UUID, note_id: UUID, expected: int, operation: Callable[[NoteStore], T]
) -> T:
    try:
        return transaction(operation)
    except StaleDataError:
        # Fresh read classifies a race but never replays the failed write/delete.
        transaction(lambda store: store.check_version(store.find(resource_id, note_id), expected))
        raise NoteError("UNKNOWN_ERROR", 500) from None


def update(resource_id: UUID, note_id: UUID, command: NotePatch) -> dict[str, Any]:
    return {
        "data": mutate(
            resource_id,
            note_id,
            command.expected_version,
            lambda store: store.update(
                resource_id, note_id, command.content, command.expected_version
            ),
        )
    }


def delete(resource_id: UUID, note_id: UUID, expected: int) -> None:
    mutate(
        resource_id, note_id, expected, lambda store: store.delete(resource_id, note_id, expected)
    )


def create_standalone(command: NoteCreate) -> dict[str, Any]:
    return {"data": transaction(lambda store: store.create_standalone(command.content))}


def detail_standalone(note_id: UUID) -> dict[str, Any]:
    return {"data": transaction(lambda store: store.detail_standalone(note_id))}


def page_standalone(query: NoteQuery) -> dict[str, Any]:
    return transaction(lambda store: store.page_standalone(query))


def mutate_standalone[T](note_id: UUID, expected: int, operation: Callable[[NoteStore], T]) -> T:
    try:
        return transaction(operation)
    except StaleDataError:
        # Fresh read classifies a race but never replays the failed write/delete.
        transaction(lambda store: store.check_version(store.standalone(note_id), expected))
        raise NoteError("UNKNOWN_ERROR", 500) from None


def update_standalone(note_id: UUID, command: NotePatch) -> dict[str, Any]:
    return {
        "data": mutate_standalone(
            note_id,
            command.expected_version,
            lambda store: store.update_standalone(
                note_id, command.content, command.expected_version
            ),
        )
    }


def delete_standalone(note_id: UUID, expected: int) -> None:
    mutate_standalone(note_id, expected, lambda store: store.delete_standalone(note_id, expected))
