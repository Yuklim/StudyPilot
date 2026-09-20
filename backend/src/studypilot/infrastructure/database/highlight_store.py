"""Only Highlight is writable here; the resource, its snapshot and the notes are
read-only prerequisites.

A highlight may only be made on text the user can actually be reading: the
resource must be readable and must already hold a READY snapshot, because that
frozen text is what the anchor points into. The optional note must belong to the
same resource - a note written under a different article cannot be "about" this
passage - and to at most one highlight.

Nothing in here reads snapshot content. Whether an anchor still finds its
passage is decided by the reader at render time (docs/research 5.1); the store
keeps what was recorded and never rewrites it.
"""

from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from studypilot.modules.highlights.contracts import HighlightCreate, HighlightError, HighlightQuery

from .models import ContentSnapshot, Highlight, LearningResource, Note, OriginalFile

FIELDS = (
    "id",
    "resource_id",
    "exact",
    "prefix",
    "suffix",
    "start_offset",
    "end_offset",
    "note_id",
    "version",
    "created_at",
    "updated_at",
)


def project(highlight: Highlight) -> dict[str, Any]:
    return {field: getattr(highlight, field) for field in FIELDS}


class HighlightStore:
    def __init__(self, session: Session) -> None:
        self.session = session

    def require_resource(self, resource_id: UUID) -> None:
        """Readable resource, same rule the notes store applies."""
        ready = (
            select(OriginalFile.id)
            .where(OriginalFile.resource_id == LearningResource.id, OriginalFile.status == "READY")
            .exists()
        )
        if (
            self.session.scalar(
                select(LearningResource.id).where(
                    LearningResource.id == resource_id,
                    or_(LearningResource.source_type != "FILE", ready),
                )
            )
            is None
        ):
            raise HighlightError("RESOURCE_NOT_FOUND", 404)

    def require_snapshot(self, resource_id: UUID) -> None:
        """There has to be text to mark: a READY snapshot for this resource."""
        if (
            self.session.scalar(
                select(ContentSnapshot.id).where(
                    ContentSnapshot.resource_id == resource_id, ContentSnapshot.status == "READY"
                )
            )
            is None
        ):
            raise HighlightError("SNAPSHOT_NOT_FOUND", 404)

    def require_note(
        self, resource_id: UUID, note_id: UUID | None, highlight_id: UUID | None
    ) -> None:
        """The note must be this resource's, and spoken for by no other highlight."""
        if note_id is None:
            return
        if (
            self.session.scalar(
                select(Note.id).where(Note.id == note_id, Note.resource_id == resource_id)
            )
            is None
        ):
            raise HighlightError("NOTE_NOT_FOUND", 404)
        taken = select(Highlight.id).where(Highlight.note_id == note_id)
        if highlight_id is not None:
            taken = taken.where(Highlight.id != highlight_id)
        if self.session.scalar(taken) is not None:
            raise HighlightError("NOTE_ALREADY_HIGHLIGHTED", 409)

    def find(self, resource_id: UUID, highlight_id: UUID) -> Highlight:
        self.require_resource(resource_id)
        highlight = self.session.scalar(
            select(Highlight).where(
                Highlight.id == highlight_id, Highlight.resource_id == resource_id
            )
        )
        if highlight is None:
            raise HighlightError("HIGHLIGHT_NOT_FOUND", 404)
        return highlight

    @staticmethod
    def check_version(highlight: Highlight, expected: int) -> None:
        if highlight.version != expected:
            raise HighlightError("VERSION_CONFLICT", 409, {"current_version": highlight.version})

    def create(self, resource_id: UUID, command: HighlightCreate) -> dict[str, Any]:
        self.require_resource(resource_id)
        self.require_snapshot(resource_id)
        self.require_note(resource_id, command.note_id, None)
        highlight = Highlight(
            resource_id=resource_id,
            exact=command.exact,
            prefix=command.prefix,
            suffix=command.suffix,
            start_offset=command.start_offset,
            end_offset=command.end_offset,
            note_id=command.note_id,
        )
        self.session.add(highlight)
        self.session.flush()
        return project(highlight)

    def detail(self, resource_id: UUID, highlight_id: UUID) -> dict[str, Any]:
        return project(self.find(resource_id, highlight_id))

    def rebind(
        self, resource_id: UUID, highlight_id: UUID, note_id: UUID | None, expected: int
    ) -> dict[str, Any]:
        """Bind, rebind or (with note_id null) unbind the note. The anchor never moves."""
        highlight = self.find(resource_id, highlight_id)
        self.check_version(highlight, expected)
        self.require_note(resource_id, note_id, highlight_id)
        if highlight.note_id != note_id:
            highlight.note_id = note_id
        self.session.flush()
        return project(highlight)

    def delete(self, resource_id: UUID, highlight_id: UUID, expected: int) -> None:
        highlight = self.find(resource_id, highlight_id)
        self.check_version(highlight, expected)
        self.session.delete(highlight)
        self.session.flush()

    def page(self, resource_id: UUID, query: HighlightQuery) -> dict[str, Any]:
        self.require_resource(resource_id)
        scope = Highlight.resource_id == resource_id
        total = int(
            self.session.scalar(select(func.count()).select_from(Highlight).where(scope)) or 0
        )
        column = getattr(Highlight, query.sort.lstrip("-"))
        offset = (query.page - 1) * query.page_size
        rows = self.session.scalars(
            select(Highlight)
            .where(scope)
            .order_by(column.desc() if query.sort.startswith("-") else column, Highlight.id)
            .offset(offset)
            .limit(query.page_size)
        )
        return {
            "data": [project(row) for row in rows],
            "page": {
                "number": query.page,
                "size": query.page_size,
                "total_items": total,
                "total_pages": (total + query.page_size - 1) // query.page_size,
                "has_more": offset + query.page_size < total,
            },
        }
