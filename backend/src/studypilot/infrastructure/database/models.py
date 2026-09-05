"""Physical storage for the approved TASK-003 contract, not HTTP/domain services.

Ownership stays with the module recorded in each table's info. Cross-object
state transitions, deletion confirmation and file recovery belong to future
application transactions, not implicit mapper callbacks.
"""

from datetime import date, datetime
from typing import Any
from unicodedata import normalize
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Connection,
    Date,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Text,
    Uuid,
    event,
    inspect,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Mapper, declared_attr, mapped_column

from .types import UTCDateTime, utc_now

LEARNING_STATUSES = ("UNREAD", "IN_PROGRESS", "COMPLETED", "REVIEW_DUE", "ARCHIVED")


def choices(name: str, *values: str) -> String:
    return String(max(map(len, values)))


def bounded_length(column: str, minimum: int, maximum: int) -> CheckConstraint:
    return CheckConstraint(
        f"length({column}) BETWEEN {minimum} AND {maximum}", name=f"{column}_length"
    )


def positive_version() -> CheckConstraint:
    return CheckConstraint("version >= 1", name="positive_version")


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(table_name)s_%(column_0_name)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class Identified:
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)


class Created:
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


class Versioned:
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now, onupdate=utc_now)

    @declared_attr.directive
    def __mapper_args__(cls) -> dict[str, Any]:
        return {"version_id_col": cls.version}


class Topic(Identified, Created, Versioned, Base):
    __tablename__ = "topics"
    __table_args__ = (
        bounded_length("name", 1, 80),
        bounded_length("description", 0, 500),
        CheckConstraint("length(normalized_name) >= 1", name="normalized_name_nonempty"),
        positive_version(),
        {"info": {"owner": "taxonomy"}},
    )
    name: Mapped[str] = mapped_column(String(80))
    normalized_name: Mapped[str] = mapped_column(Text, unique=True)
    description: Mapped[str | None] = mapped_column(String(500))


class Tag(Identified, Created, Versioned, Base):
    __tablename__ = "tags"
    __table_args__ = (
        bounded_length("name", 1, 50),
        CheckConstraint("length(normalized_name) >= 1", name="normalized_name_nonempty"),
        positive_version(),
        {"info": {"owner": "taxonomy"}},
    )
    name: Mapped[str] = mapped_column(String(50))
    normalized_name: Mapped[str] = mapped_column(Text, unique=True)


class LearningResource(Identified, Created, Versioned, Base):
    __tablename__ = "learning_resources"
    __table_args__ = (
        CheckConstraint("source_type IN ('WEB', 'FILE', 'PASTE')", name="source_type"),
        bounded_length("title", 1, 200),
        bounded_length("source_url", 1, 2048),
        bounded_length("pasted_content", 1, 1_000_000),
        bounded_length("source_name", 0, 120),
        bounded_length("save_reason", 0, 1000),
        CheckConstraint(
            "(source_type = 'WEB' AND source_url IS NOT NULL AND pasted_content IS NULL) OR "
            "(source_type = 'PASTE' AND pasted_content IS NOT NULL AND source_url IS NULL) OR "
            "(source_type = 'FILE' AND source_url IS NULL AND pasted_content IS NULL)",
            name="exclusive_source",
        ),
        positive_version(),
        Index("ix_learning_resources_created_id", "created_at", "id"),
        {"info": {"owner": "resources"}},
    )
    title: Mapped[str | None] = mapped_column(String(200))
    source_type: Mapped[str] = mapped_column(choices("source_type", "WEB", "FILE", "PASTE"))
    source_url: Mapped[str | None] = mapped_column(String(2048))
    pasted_content: Mapped[str | None] = mapped_column(Text)
    source_name: Mapped[str | None] = mapped_column(String(120))
    save_reason: Mapped[str | None] = mapped_column(String(1000))
    topic_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("topics.id", ondelete="RESTRICT"), index=True
    )


class OriginalFile(Identified, Created, Versioned, Base):
    __tablename__ = "original_files"
    __table_args__ = (
        CheckConstraint("status IN ('PENDING', 'READY', 'FAILED')", name="status"),
        CheckConstraint(
            "media_type IN ('application/pdf', 'application/msword', "
            "'application/vnd.openxmlformats-officedocument.wordprocessingml.document', "
            "'text/markdown; charset=utf-8', 'text/plain; charset=utf-8')",
            name="media_type",
        ),
        bounded_length("original_name", 1, 255),
        bounded_length("sha256", 64, 64),
        CheckConstraint("length(storage_key) >= 1", name="storage_key_nonempty"),
        CheckConstraint("size_bytes BETWEEN 1 AND 26214400", name="size_bounds"),
        CheckConstraint(
            "(status = 'FAILED' AND failure_code IS NOT NULL AND length(failure_code) > 0) OR "
            "(status <> 'FAILED' AND failure_code IS NULL)",
            name="failure_state",
        ),
        CheckConstraint("status <> 'READY' OR staging_key IS NULL", name="ready_staging_cleared"),
        positive_version(),
        {"info": {"owner": "resources"}},
    )
    resource_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("learning_resources.id", ondelete="CASCADE"), unique=True
    )
    original_name: Mapped[str] = mapped_column(String(255))
    staging_key: Mapped[str | None] = mapped_column(Text)
    storage_key: Mapped[str] = mapped_column(Text, unique=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    media_type: Mapped[str] = mapped_column(
        choices(
            "media_type",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/markdown; charset=utf-8",
            "text/plain; charset=utf-8",
        )
    )
    sha256: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(
        choices("status", "PENDING", "READY", "FAILED"),
        default="PENDING",
        server_default="PENDING",
    )
    failure_code: Mapped[str | None] = mapped_column(Text)


class DeletionConfirmation(Identified, Created, Base):
    __tablename__ = "deletion_confirmations"
    __table_args__ = (
        bounded_length("token_digest", 64, 64),
        bounded_length("impact_revision", 64, 64),
        CheckConstraint("resource_version >= 1", name="resource_version_positive"),
        CheckConstraint("expires_at > created_at", name="expiry_after_creation"),
        {"info": {"owner": "resources"}},
    )
    # Logical binding only: this record must survive deleting its resource.
    resource_id: Mapped[UUID] = mapped_column(Uuid, index=True)
    resource_version: Mapped[int] = mapped_column(Integer)
    token_digest: Mapped[str] = mapped_column(String(64), unique=True)
    impact_manifest: Mapped[dict[str, Any]] = mapped_column(JSON(none_as_null=True))
    impact_revision: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime(), index=True)
    used_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class LearningProgress(Versioned, Base):
    __tablename__ = "learning_progress"
    __table_args__ = (
        CheckConstraint(
            "status IN ('UNREAD', 'IN_PROGRESS', 'COMPLETED', 'REVIEW_DUE', 'ARCHIVED')",
            name="status",
        ),
        CheckConstraint(
            "archived_from_status IN ('UNREAD', 'IN_PROGRESS', 'COMPLETED', 'REVIEW_DUE')",
            name="archived_from_status",
        ),
        CheckConstraint("progress_percent BETWEEN 0 AND 100", name="progress_bounds"),
        CheckConstraint("status <> 'UNREAD' OR progress_percent = 0", name="unread_progress"),
        CheckConstraint("status <> 'COMPLETED' OR completed_at IS NOT NULL", name="completed_time"),
        CheckConstraint(
            "(status = 'ARCHIVED' AND archived_from_status IS NOT NULL "
            "AND archived_from_status <> 'ARCHIVED') OR "
            "(status <> 'ARCHIVED' AND archived_from_status IS NULL)",
            name="archive_memory",
        ),
        positive_version(),
        {"info": {"owner": "learning"}},
    )
    resource_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("learning_resources.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[str] = mapped_column(
        choices("status", *LEARNING_STATUSES),
        default="UNREAD",
        server_default="UNREAD",
        index=True,
    )
    progress_percent: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    archived_from_status: Mapped[str | None] = mapped_column(
        choices("archived_from_status", *LEARNING_STATUSES[:-1])
    )


class ResourceTag(Created, Base):
    __tablename__ = "resource_tags"
    __table_args__ = (
        CheckConstraint("association_version = 1", name="immutable_association_version"),
        {"info": {"owner": "taxonomy"}},
    )
    resource_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("learning_resources.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("tags.id", ondelete="RESTRICT"), primary_key=True, index=True
    )
    association_version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")


class Note(Identified, Created, Versioned, Base):
    __tablename__ = "notes"
    __table_args__ = (
        bounded_length("content", 1, 50_000),
        positive_version(),
        {"info": {"owner": "notes"}},
    )
    # NULL means a standalone note not attached to any resource (own entry page);
    # the FK still cascades deletion for attached notes only (NULL never matches a parent).
    resource_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("learning_resources.id", ondelete="CASCADE"), index=True
    )
    content: Mapped[str] = mapped_column(Text)


class StudyRecord(Identified, Created, Base):
    __tablename__ = "study_records"
    __table_args__ = (
        CheckConstraint(
            "status_before IN ('UNREAD', 'IN_PROGRESS', 'COMPLETED', 'REVIEW_DUE', 'ARCHIVED')",
            name="status_before",
        ),
        CheckConstraint(
            "status_after IN ('UNREAD', 'IN_PROGRESS', 'COMPLETED', 'REVIEW_DUE', 'ARCHIVED')",
            name="status_after",
        ),
        CheckConstraint("duration_seconds BETWEEN 0 AND 86400", name="duration_bounds"),
        CheckConstraint("progress_before BETWEEN 0 AND 100", name="progress_before_bounds"),
        CheckConstraint("progress_after BETWEEN 0 AND 100", name="progress_after_bounds"),
        bounded_length("summary", 0, 5000),
        bounded_length("questions_next", 0, 5000),
        Index("ix_study_records_resource_started", "resource_id", "started_at", "id"),
        {"info": {"owner": "learning"}},
    )
    resource_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("learning_resources.id", ondelete="CASCADE")
    )
    started_at: Mapped[datetime] = mapped_column(UTCDateTime())
    duration_seconds: Mapped[int] = mapped_column(Integer)
    progress_before: Mapped[int] = mapped_column(Integer)
    progress_after: Mapped[int] = mapped_column(Integer)
    status_before: Mapped[str] = mapped_column(choices("status_before", *LEARNING_STATUSES))
    status_after: Mapped[str] = mapped_column(choices("status_after", *LEARNING_STATUSES))
    summary: Mapped[str | None] = mapped_column(Text)
    questions_next: Mapped[str | None] = mapped_column(Text)


class ActiveReviewPlan(Created, Versioned, Base):
    __tablename__ = "active_review_plans"
    __table_args__ = (
        CheckConstraint("status IN ('SCHEDULED', 'PAUSED')", name="status"),
        CheckConstraint(
            "(status = 'SCHEDULED' AND due_date IS NOT NULL) OR "
            "(status = 'PAUSED' AND due_date IS NULL)",
            name="scheduled_date",
        ),
        positive_version(),
        Index("ix_active_review_plans_status_due", "status", "due_date", "resource_id"),
        {"info": {"owner": "reviews"}},
    )
    resource_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("learning_resources.id", ondelete="CASCADE"), primary_key=True
    )
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        choices("status", "SCHEDULED", "PAUSED"), default="SCHEDULED", server_default="SCHEDULED"
    )


class ReviewRecord(Identified, Created, Base):
    __tablename__ = "review_records"
    __table_args__ = (
        CheckConstraint("result IN ('UNDERSTOOD', 'NEEDS_REVIEW')", name="result"),
        bounded_length("notes", 0, 5000),
        CheckConstraint(
            "result <> 'NEEDS_REVIEW' OR next_review_date IS NOT NULL", name="next_review_required"
        ),
        Index("ix_review_records_resource_completed", "resource_id", "completed_at", "id"),
        {"info": {"owner": "reviews"}},
    )
    resource_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("learning_resources.id", ondelete="CASCADE")
    )
    planned_date: Mapped[date] = mapped_column(Date)
    completed_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
    result: Mapped[str] = mapped_column(choices("result", "UNDERSTOOD", "NEEDS_REVIEW"))
    notes: Mapped[str | None] = mapped_column(Text)
    next_review_date: Mapped[date | None] = mapped_column(Date)


@event.listens_for(Topic, "before_insert")
@event.listens_for(Topic, "before_update")
@event.listens_for(Tag, "before_insert")
@event.listens_for(Tag, "before_update")
def _normalize_name(mapper: Mapper[Any], connection: Connection, target: Topic | Tag) -> None:
    target.name = target.name.strip()
    target.normalized_name = " ".join(normalize("NFKC", target.name).casefold().split())


@event.listens_for(LearningResource, "before_update")
def _preserve_source(mapper: Mapper[Any], connection: Connection, target: LearningResource) -> None:
    if inspect(target).attrs.source_type.history.has_changes():
        raise ValueError("A resource source_type cannot be changed")


@event.listens_for(StudyRecord, "before_update")
@event.listens_for(ReviewRecord, "before_update")
@event.listens_for(StudyRecord, "before_delete")
@event.listens_for(ReviewRecord, "before_delete")
def _preserve_history(
    mapper: Mapper[Any], connection: Connection, target: StudyRecord | ReviewRecord
) -> None:
    raise ValueError("History is append-only; only confirmed resource deletion may cascade")
