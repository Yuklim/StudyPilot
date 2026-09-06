"""Short-lived transactions; commit before returning, never replay a write."""

from collections.abc import Callable
from typing import Any
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError

from studypilot.infrastructure.database import create_database_engine, create_session_factory
from studypilot.infrastructure.database.taxonomy_store import TaxonomyStore
from studypilot.modules.taxonomy.contracts import (
    Kind,
    TagCreate,
    TagMerge,
    TagPatch,
    TaxonomyError,
    TaxonomyQuery,
    TopicCreate,
    TopicPatch,
)


def transaction[T](operation: Callable[[TaxonomyStore], T]) -> T:
    engine = create_database_engine()
    try:
        with create_session_factory(engine).begin() as session:
            result = operation(TaxonomyStore(session))
        return result
    finally:
        engine.dispose()


def create(kind: Kind, command: TopicCreate | TagCreate) -> dict[str, Any]:
    try:
        return {"data": transaction(lambda store: store.create(kind, command.model_dump()))}
    except IntegrityError:
        # Classify a raced duplicate using fresh state, never SQL/driver messages.
        transaction(lambda store: store.unique(kind, command.name))
        raise TaxonomyError("UNKNOWN_ERROR", 500) from None


def detail(kind: Kind, identity: UUID) -> dict[str, Any]:
    return {"data": transaction(lambda store: store.detail(kind, identity))}


def page(kind: Kind, query: TaxonomyQuery) -> dict[str, Any]:
    return transaction(lambda store: store.page(kind, query))


def update(kind: Kind, identity: UUID, command: TopicPatch | TagPatch) -> dict[str, Any]:
    values = command.model_dump(exclude_unset=True)
    try:
        return {"data": transaction(lambda store: store.update(kind, identity, values))}
    except (IntegrityError, StaleDataError):

        def classify(store: TaxonomyStore) -> None:
            store.check_version(store.find(kind, identity), command.expected_version)
            if command.name is not None:
                store.unique(kind, command.name, identity)

        transaction(classify)
        raise TaxonomyError("UNKNOWN_ERROR", 500) from None


def delete(kind: Kind, identity: UUID, expected: int) -> None:
    try:
        transaction(lambda store: store.delete(kind, identity, expected))
    except (IntegrityError, StaleDataError):

        def classify(store: TaxonomyStore) -> None:
            store.check_version(store.find(kind, identity), expected)
            count = store.references(kind, identity)
            if count:
                raise TaxonomyError("TAXONOMY_IN_USE", 409, {"resource_count": count})

        transaction(classify)
        raise TaxonomyError("UNKNOWN_ERROR", 500) from None


def detach_all(tag_id: UUID, expected_resource_count: int) -> dict[str, Any]:
    return {"data": transaction(lambda store: store.detach_all(tag_id, expected_resource_count))}


def merge(tag_id: UUID, command: TagMerge) -> dict[str, Any]:
    try:
        return {"data": transaction(lambda store: store.merge(tag_id, command))}
    except (IntegrityError, StaleDataError):
        # Classify a lost race through fresh state; never replay a batch write.
        def classify(store: TaxonomyStore) -> None:
            store.check_version(store.find("tag", tag_id), command.expected_version)
            store.check_usage("tag", tag_id, command.expected_resource_count)

        transaction(classify)
        raise TaxonomyError("UNKNOWN_ERROR", 500) from None


def attach(resource_id: UUID, tag_id: UUID) -> dict[str, Any]:
    try:
        return {"data": transaction(lambda store: store.attach(resource_id, tag_id))}
    except IntegrityError:

        def existing(store: TaxonomyStore) -> dict[str, Any]:
            store.validate_parents(resource_id, tag_id)
            record = store.association(resource_id, tag_id)
            if record is None:
                raise TaxonomyError("UNKNOWN_ERROR", 500)
            return {
                field: getattr(record, field)
                for field in ("resource_id", "tag_id", "created_at", "association_version")
            }

        return {"data": transaction(existing)}


def detach(resource_id: UUID, tag_id: UUID) -> None:
    transaction(lambda store: store.detach(resource_id, tag_id))
