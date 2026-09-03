"""Coordinate one atomic resource command; never expose mutable ORM objects."""

from collections.abc import Callable
from contextlib import AbstractContextManager
from typing import Any
from uuid import UUID

from sqlalchemy.orm.exc import StaleDataError

from studypilot.infrastructure.database import create_database_engine, create_session_factory
from studypilot.infrastructure.database.resource_store import ResourceStore
from studypilot.modules.resources.contracts import (
    CreateResource,
    ResourceError,
    ResourcePatch,
    ResourceQuery,
)
from studypilot.modules.resources.files import FileStorage


def _transaction(operation: Callable[[ResourceStore], dict[str, Any]]) -> dict[str, Any]:
    # Open only on an explicit, already-authorized and validated API operation.
    engine = create_database_engine()
    try:
        with create_session_factory(engine).begin() as session:
            result = operation(ResourceStore(session))
        # Return only after commit succeeded; commit failure cannot look like 201.
        return result
    finally:
        engine.dispose()


def create_resource(command: CreateResource) -> dict[str, Any]:
    def create(store: ResourceStore) -> dict[str, Any]:
        store.validate_taxonomy(command.topic_id, command.tag_ids)
        resource_id = store.insert_resource(command)
        store.initialize_progress(resource_id)
        store.attach_tags(resource_id, command.tag_ids)
        return {"data": store.detail(resource_id)}

    return _transaction(create)


def list_resources(query: ResourceQuery) -> dict[str, Any]:
    return _transaction(lambda store: store.page(query))


def get_resource(resource_id: UUID) -> dict[str, Any]:
    return _transaction(lambda store: {"data": store.detail(resource_id)})


def update_resource(resource_id: UUID, command: ResourcePatch) -> dict[str, Any]:
    try:
        return _transaction(lambda store: {"data": store.update(resource_id, command)})
    except StaleDataError:
        # Classify a lost race through a fresh read; never replay the mutation.
        latest = get_resource(resource_id)["data"]
        if latest["version"] != command.expected_version:
            raise ResourceError("VERSION_CONFLICT", 409, latest["version"]) from None
        raise ResourceError("UNKNOWN_ERROR", 500) from None


def preview_resource_deletion(resource_id: UUID) -> dict[str, Any]:
    return _transaction(lambda store: {"data": store.preview_deletion(resource_id)})


def delete_resource(
    resource_id: UUID, token: str, lock: AbstractContextManager[object], storage: FileStorage
) -> dict[str, Any]:
    with lock:
        result = _transaction(lambda store: store.delete_resource(resource_id, token, storage))
    if result.get("error") == "DELETION_IMPACT_CHANGED":
        raise ResourceError(
            "DELETION_IMPACT_CHANGED", 409, details={"current_impact": result["current_impact"]}
        )
    return {}
