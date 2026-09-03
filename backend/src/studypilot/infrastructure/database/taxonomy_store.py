"""SQLAlchemy adapter: only Topic, Tag and ResourceTag are writable here."""

from typing import Any, cast
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from studypilot.modules.taxonomy.contracts import (
    Kind,
    TaxonomyError,
    TaxonomyQuery,
    normalized_name,
)

from .models import LearningResource, ResourceTag, Tag, Topic

MODELS: dict[Kind, type[Topic | Tag]] = {"topic": Topic, "tag": Tag}
FIELDS = ("id", "name", "version", "created_at", "updated_at")


def project(record: Topic | Tag) -> dict[str, Any]:
    result = {field: getattr(record, field) for field in FIELDS}
    if isinstance(record, Topic):
        result["description"] = record.description
    return result


class TaxonomyStore:
    def __init__(self, session: Session) -> None:
        self.session = session

    def find(self, kind: Kind, identity: UUID) -> Topic | Tag:
        record = self.session.get(MODELS[kind], identity)
        if record is None:
            raise TaxonomyError(f"{kind.upper()}_NOT_FOUND", 404)
        assert isinstance(record, (Topic, Tag))
        return record

    def detail(self, kind: Kind, identity: UUID) -> dict[str, Any]:
        return project(self.find(kind, identity))

    def unique(self, kind: Kind, name: str, identity: UUID | None = None) -> None:
        model = MODELS[kind]
        statement = select(model.id).where(model.normalized_name == normalized_name(name))
        if identity is not None:
            statement = statement.where(model.id != identity)
        if self.session.scalar(statement) is not None:
            raise TaxonomyError(f"DUPLICATE_{kind.upper()}", 409)

    def create(self, kind: Kind, values: dict[str, Any]) -> dict[str, Any]:
        self.unique(kind, values["name"])
        record = MODELS[kind](**values)
        self.session.add(record)
        self.session.flush()
        return project(record)

    def check_version(self, record: Topic | Tag, expected: int) -> None:
        if record.version != expected:
            raise TaxonomyError("VERSION_CONFLICT", 409, {"current_version": record.version})

    def update(self, kind: Kind, identity: UUID, values: dict[str, Any]) -> dict[str, Any]:
        record = self.find(kind, identity)
        self.check_version(record, values["expected_version"])
        if "name" in values:
            self.unique(kind, values["name"], identity)
        for key, value in values.items():
            if key != "expected_version" and getattr(record, key) != value:
                setattr(record, key, value)
        # ORM version guards and timestamps apply only to actual dirty columns.
        self.session.flush()
        return project(record)

    def references(self, kind: Kind, identity: UUID) -> int:
        statement = (
            select(func.count())
            .select_from(LearningResource)
            .where(LearningResource.topic_id == identity)
            if kind == "topic"
            else select(func.count()).select_from(ResourceTag).where(ResourceTag.tag_id == identity)
        )
        return int(self.session.scalar(statement) or 0)

    def delete(self, kind: Kind, identity: UUID, expected: int) -> None:
        record = self.find(kind, identity)
        self.check_version(record, expected)
        count = self.references(kind, identity)
        if count:
            raise TaxonomyError("TAXONOMY_IN_USE", 409, {"resource_count": count})
        self.session.delete(record)
        self.session.flush()  # FK RESTRICT is a second barrier against reference races.

    def page(self, kind: Kind, query: TaxonomyQuery) -> dict[str, Any]:
        model = MODELS[kind]
        column = getattr(model, query.sort.lstrip("-"))
        statement = cast(
            Select[tuple[Topic | Tag]],
            select(model).order_by(
                column.desc() if query.sort.startswith("-") else column, model.id
            ),
        )
        offset = (query.page - 1) * query.page_size
        if query.q is None:
            total = int(self.session.scalar(select(func.count()).select_from(model)) or 0)
            selected = list(self.session.scalars(statement.offset(offset).limit(query.page_size)))
        else:
            # Personal-scale Unicode matching, same semantics as the resource list.
            needle = normalized_name(query.q)
            matches = [
                row
                for row in self.session.scalars(statement)
                if needle in normalized_name(row.name)
            ]
            total, selected = len(matches), matches[offset : offset + query.page_size]
        return {
            "data": [project(row) for row in selected],
            "page": {
                "number": query.page,
                "size": query.page_size,
                "total_items": total,
                "total_pages": (total + query.page_size - 1) // query.page_size,
                "has_more": offset + query.page_size < total,
            },
        }

    def validate_parents(self, resource_id: UUID, tag_id: UUID) -> None:
        if (
            self.session.scalar(
                select(LearningResource.id).where(LearningResource.id == resource_id)
            )
            is None
        ):
            raise TaxonomyError("RESOURCE_NOT_FOUND", 404)
        self.find("tag", tag_id)

    def association(self, resource_id: UUID, tag_id: UUID) -> ResourceTag | None:
        return self.session.get(ResourceTag, (resource_id, tag_id))

    def attach(self, resource_id: UUID, tag_id: UUID) -> dict[str, Any]:
        self.validate_parents(resource_id, tag_id)
        record = self.association(resource_id, tag_id)
        if record is None:
            record = ResourceTag(resource_id=resource_id, tag_id=tag_id)
            self.session.add(record)
            self.session.flush()
        return {
            field: getattr(record, field)
            for field in ("resource_id", "tag_id", "created_at", "association_version")
        }

    def detach(self, resource_id: UUID, tag_id: UUID) -> None:
        self.validate_parents(resource_id, tag_id)
        record = self.association(resource_id, tag_id)
        if record is not None:
            self.session.delete(record)
            self.session.flush()
