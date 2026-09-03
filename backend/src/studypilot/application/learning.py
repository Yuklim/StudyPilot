"""Commit progress and its history together; never replay uncertain writes."""

from collections.abc import Callable
from typing import Any
from uuid import UUID

from sqlalchemy.orm.exc import StaleDataError

from studypilot.infrastructure.database import create_database_engine, create_session_factory
from studypilot.infrastructure.database.learning_store import LearningStore
from studypilot.modules.learning.contracts import LearningError, RecordQuery, StudyRecordCreate


def transaction[T](operation: Callable[[LearningStore], T]) -> T:
    engine = create_database_engine()
    try:
        with create_session_factory(engine).begin() as session:
            result = operation(LearningStore(session))
        return result
    finally:
        engine.dispose()


def create(resource_id: UUID, command: StudyRecordCreate) -> dict[str, Any]:
    try:
        return {"data": transaction(lambda store: store.create(resource_id, command))}
    except StaleDataError:
        # Read fresh state only to classify a conflict; do not repeat the write.
        version = transaction(lambda store: store.progress(resource_id).version)
        if version != command.expected_progress_version:
            raise LearningError("VERSION_CONFLICT", 409, {"current_version": version}) from None
        raise LearningError("UNKNOWN_ERROR", 500) from None


def page(query: RecordQuery, resource_id: UUID | None = None) -> dict[str, Any]:
    return transaction(lambda store: store.page(query, resource_id))
