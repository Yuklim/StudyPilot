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
    UniqueConstraint,
    Uuid,
    event,
    inspect,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Mapper, declared_attr, mapped_column

from studypilot.modules.citations.contracts import ITEM_TYPES as CITATION_ITEM_TYPES
from studypilot.modules.resources.assets import IMAGE_MEDIA_TYPES

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


class ContentSnapshot(Identified, Created, Versioned, Base):
    """A frozen copy of the resource's text, taken when it was saved.

    Kept out of `learning_resources` on purpose: that table's source-exclusivity
    CHECK requires a WEB resource to have no inline content, and a snapshot must be
    able to sit beside `source_url` without relaxing it. A snapshot is also not an
    uploaded original — it is system-generated, text-only, and never enters the
    controlled file directory.
    """

    __tablename__ = "content_snapshots"
    __table_args__ = (
        CheckConstraint("format IN ('MARKDOWN')", name="format"),
        CheckConstraint("status IN ('READY', 'FAILED')", name="status"),
        # READY carries the text; FAILED records why there is none. The two states
        # never overlap, mirroring OriginalFile.failure_state. The `IS NOT NULL` is
        # load-bearing, not redundant: without it `length(NULL) > 0` makes the FAILED
        # branch NULL, the whole CHECK NULL, and SQLite accepts NULL as satisfied.
        CheckConstraint(
            "(status = 'READY' AND failure_code IS NULL AND content IS NOT NULL "
            "AND char_count IS NOT NULL AND sha256 IS NOT NULL) OR "
            "(status = 'FAILED' AND failure_code IS NOT NULL AND length(failure_code) > 0 "
            "AND content IS NULL "
            "AND char_count IS NULL AND sha256 IS NULL)",
            name="capture_state",
        ),
        CheckConstraint(
            "content IS NULL OR length(content) BETWEEN 1 AND 1000000", name="content_length"
        ),
        CheckConstraint(
            "char_count IS NULL OR char_count BETWEEN 1 AND 1000000", name="char_count_bounds"
        ),
        CheckConstraint("sha256 IS NULL OR length(sha256) = 64", name="sha256_length"),
        CheckConstraint("length(extractor) BETWEEN 1 AND 80", name="extractor_length"),
        positive_version(),
        {"info": {"owner": "resources"}},
    )
    resource_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("learning_resources.id", ondelete="CASCADE"), unique=True
    )
    format: Mapped[str] = mapped_column(choices("format", "MARKDOWN"), default="MARKDOWN")
    content: Mapped[str | None] = mapped_column(Text)
    char_count: Mapped[int | None] = mapped_column(Integer)
    sha256: Mapped[str | None] = mapped_column(String(64))
    captured_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
    # The URL actually read, which may differ from source_url after a redirect.
    captured_from_url: Mapped[str | None] = mapped_column(String(2048))
    # Which producer made this text, so a later reader can judge its quality.
    extractor: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(choices("status", "READY", "FAILED"), default="READY")
    failure_code: Mapped[str | None] = mapped_column(Text)


class SnapshotAsset(Identified, Created, Base):
    """One image belonging to a snapshot's frozen text, stored as bytes on disk.

    It hangs off the snapshot rather than the resource because an image is part of
    a particular copy of the text: replacing the text makes its images obsolete,
    and the CASCADE says so. Neither existing table could carry it —
    `content_snapshots.content` is Text, and `original_files` is UNIQUE per resource
    with a media-type allowlist that has no image in it.

    Not `Versioned`: an asset is written once and deleted, never edited in place.
    Its precondition is the snapshot's version, which is what a caller can see.

    The row is the only thing that keeps the bytes alive — `FileRepository.references()`
    reads this table, and anything in the controlled directory it does not name is
    swept as an orphan after 24 hours.
    """

    __tablename__ = "snapshot_assets"
    __table_args__ = (
        CheckConstraint(
            "media_type IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')",
            name="media_type",
        ),
        bounded_length("sha256", 64, 64),
        bounded_length("source_url", 1, 2048),
        CheckConstraint("length(storage_key) >= 1", name="storage_key_nonempty"),
        CheckConstraint("size_bytes BETWEEN 1 AND 10485760", name="size_bounds"),
        # One row per address per snapshot: re-uploading the same image is idempotent.
        UniqueConstraint("snapshot_id", "source_url"),
        {"info": {"owner": "resources"}},
    )
    snapshot_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("content_snapshots.id", ondelete="CASCADE"), index=True
    )
    # Where the image sat in the captured page. A matching key for renderers, never
    # a fetch target: the backend makes no outbound request.
    source_url: Mapped[str] = mapped_column(String(2048))
    storage_key: Mapped[str] = mapped_column(Text, unique=True)
    media_type: Mapped[str] = mapped_column(choices("media_type", *IMAGE_MEDIA_TYPES))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))


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
        # 0006 widened the CHECK from 50,000 (TASK-063: inline base64 images).
        bounded_length("content", 1, 2_000_000),
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


class Highlight(Identified, Created, Versioned, Base):
    """One passage the reader marked in a resource's frozen text.

    **Layered anchor, not a position.** A character offset breaks the moment the
    text above it changes, and a DOM path breaks when the renderer changes; so a
    highlight stores what it says (`exact`) with enough context to tell repeats
    apart (`prefix`/`suffix`), and keeps the offsets only as a fallback for fuzzy
    re-location (the W3C Web Annotation model, see docs/research 5.1). Deciding
    where the anchor lands today is the reader's job at render time: the backend
    never reads the snapshot text, and a highlight whose passage can no longer be
    found is **not** recorded as such here - put the text back and it belongs again.

    A highlight stands on its own; `note_id` is the optional note written about it
    (user's decision, 2026-09-19). The link lives on this side so the notes table
    keeps its shape, and it is `SET NULL` on delete: throwing away what you wrote
    about a passage must not throw away the passage you marked.

    **The look is data too** (TASK-093): `style` says whether the passage is
    filled (`mark`) or underlined, `color` which of the four toolbar colours it
    wears. Both can change after the fact - recolouring a mark or turning it into
    an underline is the same highlight, not a new one - and both are closed sets
    checked by the database.

    **Where the anchor is measured** (TASK-089): `page_number` NULL means the
    offsets count characters of the resource's frozen snapshot; a value means
    they count characters of that page's text layer in the resource's PDF
    original (1-based, the number pdf.js and the reader use). One highlight is
    anchored in exactly one of the two - the store refuses a page for a snapshot
    resource and a missing page for a PDF one. The page is not checked against
    the document: the server never opens the PDF, so an out-of-range page simply
    fails to locate in the reader, like a passage that was edited away.
    """

    __tablename__ = "highlights"
    __table_args__ = (
        bounded_length("exact", 1, 2_000),
        CheckConstraint("prefix IS NULL OR length(prefix) <= 200", name="prefix_length"),
        CheckConstraint("suffix IS NULL OR length(suffix) <= 200", name="suffix_length"),
        CheckConstraint("start_offset >= 0 AND end_offset > start_offset", name="offset_order"),
        CheckConstraint("page_number IS NULL OR page_number >= 1", name="page_number_positive"),
        # The look is a closed set (TASK-093): the reader paints from a fixed palette
        # and the toolbar offers exactly these; an unknown value would be a mark
        # nobody can see or pick.
        CheckConstraint("style IN ('mark', 'underline')", name="style_known"),
        CheckConstraint("color IN ('yellow', 'green', 'blue', 'pink')", name="color_known"),
        # A note describes at most one passage; binding it elsewhere would leave two
        # highlights claiming the same writing.
        UniqueConstraint("note_id"),
        positive_version(),
        # The reader asks for one resource's highlights in reading order: page first
        # (snapshot anchors are NULL and sort first), then position within it.
        Index("ix_highlights_resource_start", "resource_id", "page_number", "start_offset", "id"),
        {"info": {"owner": "highlights"}},
    )
    resource_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("learning_resources.id", ondelete="CASCADE")
    )
    exact: Mapped[str] = mapped_column(Text)
    prefix: Mapped[str | None] = mapped_column(String(200))
    suffix: Mapped[str | None] = mapped_column(String(200))
    start_offset: Mapped[int] = mapped_column(Integer)
    end_offset: Mapped[int] = mapped_column(Integer)
    page_number: Mapped[int | None] = mapped_column(Integer)
    # How it is painted (TASK-093): `mark` fills the passage, `underline` draws
    # under it; both in one of four colours. Defaults are the one look that
    # existed before, so rows from earlier migrations are unchanged.
    style: Mapped[str] = mapped_column(String(16), default="mark", server_default="mark")
    color: Mapped[str] = mapped_column(String(16), default="yellow", server_default="yellow")
    note_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("notes.id", ondelete="SET NULL"))


class ResourceCitation(Identified, Created, Versioned, Base):
    """What the saved work *is*: its authors, year, journal and identifiers.

    Separate from `learning_resources` on purpose. That table answers "how do I
    get back to the thing I saved" - a title, an address, why it was kept - and
    every one of its columns is filled for every resource. Bibliographic metadata
    answers a different question ("what work is this, and how would I cite it"),
    is absent for most saved pages, and arrives as a block from a connector
    rather than field by field from a person. Putting a dozen nullable columns on
    the core table would widen the row every read pays for, and would make the
    "whole record replaced at once" write of a citation indistinguishable from
    the field-level `PATCH` the resource already has.

    One citation per resource (`UNIQUE(resource_id)`), cascading with it. There
    is no second row to reconcile, so `title`/`source_url` on the resource stay
    the single answer to "what do I click"; `container_title` here is the journal
    or book the work sat in, not a second title for the same thing.

    Nothing here is verified against the outside world: `doi`/`isbn` are stored
    as given, never resolved. The server makes no outbound request.
    """

    __tablename__ = "resource_citations"
    __table_args__ = (
        CheckConstraint(
            "item_type IN ('JOURNAL_ARTICLE', 'PREPRINT', 'CONFERENCE_PAPER', 'BOOK', "
            "'BOOK_CHAPTER', 'THESIS', 'REPORT', 'WEBPAGE', 'OTHER')",
            name="item_type",
        ),
        # A year outside this range is a typo or a parsing accident, not a work.
        CheckConstraint(
            "issued_year IS NULL OR issued_year BETWEEN 1000 AND 2200", name="issued_year_bounds"
        ),
        bounded_length("issued_date", 1, 32),
        bounded_length("container_title", 1, 500),
        bounded_length("volume", 1, 50),
        bounded_length("issue", 1, 50),
        bounded_length("pages", 1, 50),
        bounded_length("publisher", 1, 200),
        bounded_length("doi", 1, 200),
        bounded_length("isbn", 1, 32),
        bounded_length("abstract", 1, 20_000),
        positive_version(),
        {"info": {"owner": "resources"}},
    )
    resource_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("learning_resources.id", ondelete="CASCADE"), unique=True
    )
    item_type: Mapped[str] = mapped_column(
        choices("item_type", *CITATION_ITEM_TYPES), default="OTHER", server_default="OTHER"
    )
    # A JSON array of names in printing order, because the order is part of the
    # citation. There is deliberately no per-element CHECK: bounding the element
    # count or length in SQL needs JSON-dialect functions, and a byte-length
    # proxy would both reject legal names (escapes expand) and fail to bound the
    # count. The shape is enforced in `modules.citations.contracts`, which is the
    # only writer. Not indexed either - searching by author is not offered yet.
    authors: Mapped[list[str] | None] = mapped_column(JSON(none_as_null=True))
    issued_year: Mapped[int | None] = mapped_column(Integer)
    # The printed date, verbatim: "2024-03", "Spring 2024" and "2024年3月" all
    # occur, and turning them into a Date would invent a day that was never given.
    issued_date: Mapped[str | None] = mapped_column(String(32))
    # The journal, conference proceedings or book this work appeared in.
    container_title: Mapped[str | None] = mapped_column(String(500))
    volume: Mapped[str | None] = mapped_column(String(50))
    issue: Mapped[str | None] = mapped_column(String(50))
    # Free text, not a range: "12-30", "e0123456" and "1, 4-9" are all real.
    pages: Mapped[str | None] = mapped_column(String(50))
    publisher: Mapped[str | None] = mapped_column(String(200))
    doi: Mapped[str | None] = mapped_column(String(200))
    isbn: Mapped[str | None] = mapped_column(String(32))
    abstract: Mapped[str | None] = mapped_column(Text)


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
