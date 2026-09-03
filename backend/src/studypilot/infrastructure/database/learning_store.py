"""Only LearningProgress and append-only StudyRecord are written here."""

from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from studypilot.modules.learning.contracts import (
    GlobalRecordQuery,
    LearningError,
    RecordQuery,
    StudyRecordCreate,
)
from studypilot.modules.learning.state import ProgressState, changes

from .models import ActiveReviewPlan, LearningProgress, LearningResource, OriginalFile, StudyRecord
from .types import utc_now

RECORD_FIELDS = (
    "id",
    "resource_id",
    "started_at",
    "duration_seconds",
    "progress_before",
    "progress_after",
    "status_before",
    "status_after",
    "summary",
    "questions_next",
    "created_at",
)
PROGRESS_FIELDS = (
    "resource_id",
    "status",
    "progress_percent",
    "started_at",
    "completed_at",
    "archived_from_status",
    "version",
    "updated_at",
)


def project(record: object, fields: tuple[str, ...]) -> dict[str, Any]:
    return {field: getattr(record, field) for field in fields}


class LearningStore:
    def __init__(self, session: Session) -> None:
        self.session = session

    @staticmethod
    def visible() -> Any:
        ready = (
            select(OriginalFile.id)
            .where(OriginalFile.resource_id == LearningResource.id, OriginalFile.status == "READY")
            .exists()
        )
        return or_(LearningResource.source_type != "FILE", ready)

    def require_resource(self, resource_id: UUID) -> None:
        if (
            self.session.scalar(
                select(LearningResource.id).where(
                    LearningResource.id == resource_id, self.visible()
                )
            )
            is None
        ):
            raise LearningError("RESOURCE_NOT_FOUND", 404)

    def progress(self, resource_id: UUID) -> LearningProgress:
        self.require_resource(resource_id)
        record = self.session.get(LearningProgress, resource_id)
        if record is None:
            raise LearningError("UNKNOWN_ERROR", 500)
        return record

    def create(self, resource_id: UUID, command: StudyRecordCreate) -> dict[str, Any]:
        progress = self.progress(resource_id)
        plan = self.session.get(ActiveReviewPlan, resource_id)
        updates = changes(
            ProgressState(
                progress.status,
                progress.progress_percent,
                progress.started_at,
                progress.completed_at,
                progress.archived_from_status,
                progress.version,
            ),
            command,
            plan.status if plan else None,
            utc_now(),
        )
        record = StudyRecord(
            resource_id=resource_id,
            **command.model_dump(exclude={"expected_progress_version"}),
        )
        self.session.add(record)
        for field, value in updates.items():
            if getattr(progress, field) != value:
                setattr(progress, field, value)
        # ORM version guards apply to dirty progress; flush and commit are in the
        # same transaction as the insert. Never bulk-update or overwrite history.
        self.session.flush()
        return {
            "record": project(record, RECORD_FIELDS),
            "progress": project(progress, PROGRESS_FIELDS),
        }

    def page(self, query: RecordQuery, resource_id: UUID | None) -> dict[str, Any]:
        if resource_id is not None:
            self.require_resource(resource_id)
        statement = (
            select(StudyRecord)
            .join(LearningResource, LearningResource.id == StudyRecord.resource_id)
            .where(self.visible())
        )
        if resource_id is not None:
            statement = statement.where(StudyRecord.resource_id == resource_id)
        if isinstance(query, GlobalRecordQuery):
            if query.resource_id is not None:
                statement = statement.where(StudyRecord.resource_id == query.resource_id)
            if query.topic_id is not None:
                statement = statement.where(LearningResource.topic_id == query.topic_id)
        if query.started_from is not None:
            statement = statement.where(StudyRecord.started_at >= query.started_from)
        if query.started_to is not None:
            statement = statement.where(StudyRecord.started_at < query.started_to)
        total = int(
            self.session.scalar(select(func.count()).select_from(statement.subquery())) or 0
        )
        column = getattr(StudyRecord, query.sort.lstrip("-"))
        statement = statement.order_by(
            column.desc() if query.sort.startswith("-") else column, StudyRecord.id
        )
        offset = (query.page - 1) * query.page_size
        # Avoid binding unbounded user integers to SQLite OFFSET past the end.
        rows: list[StudyRecord] = (
            list(self.session.scalars(statement.offset(offset).limit(query.page_size)))
            if offset < total
            else []
        )
        return {
            "data": [project(row, RECORD_FIELDS) for row in rows],
            "page": {
                "number": query.page,
                "size": query.page_size,
                "total_items": total,
                "total_pages": (total + query.page_size - 1) // query.page_size,
                "has_more": offset + query.page_size < total,
            },
        }
