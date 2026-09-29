"""Only Highlight is writable here; the resource, its snapshot and the notes are
read-only prerequisites.

A highlight may only be made on text the user can actually be reading: the
resource must be readable and must hold the text the anchor points into - a
READY snapshot for an anchor with no page, a READY PDF original for an anchor
with one (TASK-089). One or the other, never both: a page on a snapshot
resource, or no page on a PDF one, is refused rather than guessed. The optional
note must belong to the same resource - a note written under a different
article cannot be "about" this passage - and to at most one highlight.

Nothing in here reads snapshot content. Whether an anchor still finds its
passage is decided by the reader at render time (docs/research 5.1); the store
keeps what was recorded and never rewrites it.
"""

from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from studypilot.modules.highlights.contracts import (
    HighlightCreate,
    HighlightError,
    HighlightPatch,
    HighlightQuery,
)

from .models import ContentSnapshot, Highlight, LearningResource, Note, OriginalFile

FIELDS = (
    "id",
    "resource_id",
    "exact",
    "prefix",
    "suffix",
    "start_offset",
    "end_offset",
    "page_number",
    "style",
    "color",
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

    def require_pdf(self, resource_id: UUID) -> None:
        """A page anchor needs a PDF to have pages: a READY original of that type.

        Only the type is checked, never the page count - the server does not open
        the file (the same rule that keeps it from reading snapshot text).
        """
        if (
            self.session.scalar(
                select(OriginalFile.id).where(
                    OriginalFile.resource_id == resource_id,
                    OriginalFile.status == "READY",
                    OriginalFile.media_type == "application/pdf",
                )
            )
            is None
        ):
            raise HighlightError("PDF_NOT_FOUND", 404)

    def require_anchor_target(self, resource_id: UUID, page_number: int | None) -> None:
        """Exactly one place to be anchored in (TASK-089).

        A page number on a resource that only has a snapshot is a shape error,
        not a missing thing: the caller described an anchor that cannot exist
        here, so it is 422 rather than 404. The two 404s stay distinct because
        their remedies differ - one wants the text saved first, the other is
        simply the wrong kind of resource.
        """
        if page_number is None:
            self.require_snapshot(resource_id)
            return
        has_snapshot = (
            self.session.scalar(
                select(ContentSnapshot.id).where(
                    ContentSnapshot.resource_id == resource_id, ContentSnapshot.status == "READY"
                )
            )
            is not None
        )
        if has_snapshot:
            raise HighlightError("VALIDATION_ERROR", 422)
        self.require_pdf(resource_id)

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
        self.require_anchor_target(resource_id, command.page_number)
        self.require_note(resource_id, command.note_id, None)
        highlight = Highlight(
            resource_id=resource_id,
            exact=command.exact,
            prefix=command.prefix,
            suffix=command.suffix,
            start_offset=command.start_offset,
            end_offset=command.end_offset,
            page_number=command.page_number,
            style=command.style,
            color=command.color,
            note_id=command.note_id,
        )
        self.session.add(highlight)
        self.session.flush()
        return project(highlight)

    def detail(self, resource_id: UUID, highlight_id: UUID) -> dict[str, Any]:
        return project(self.find(resource_id, highlight_id))

    def update(
        self, resource_id: UUID, highlight_id: UUID, command: HighlightPatch
    ) -> dict[str, Any]:
        """Change the note binding and/or the look (TASK-093). The anchor never moves.

        Only the fields the request named are touched; `note_id` None unbinds. A
        value equal to what is stored is not a change, so the version only moves
        when something actually did (the same rule rebinding always followed).
        """
        highlight = self.find(resource_id, highlight_id)
        self.check_version(highlight, command.expected_version)
        changes = command.changes()
        if "note_id" in changes:
            self.require_note(resource_id, changes["note_id"], highlight_id)
        for field, value in changes.items():
            if getattr(highlight, field) != value:
                setattr(highlight, field, value)
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
        descending = query.sort.startswith("-")
        column = getattr(Highlight, query.sort.lstrip("-"))
        # Reading order is page first (TASK-089): snapshot anchors have no page and
        # sort ahead of every PDF page; `created_at` order does not care about pages.
        # `nulls_first`/`nulls_last` are spelled out so the order does not depend on
        # the database's default NULL placement.
        ordering: list[Any] = [column.desc() if descending else column, Highlight.id]
        if column is Highlight.start_offset:
            ordering.insert(
                0,
                Highlight.page_number.desc().nulls_last()
                if descending
                else Highlight.page_number.asc().nulls_first(),
            )
        offset = (query.page - 1) * query.page_size
        rows = self.session.scalars(
            select(Highlight).where(scope).order_by(*ordering).offset(offset).limit(query.page_size)
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
