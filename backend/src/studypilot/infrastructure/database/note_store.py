"""Only Note is writable here; resource visibility is a read-only prerequisite.

Two scopes share one notes table: attached notes (resource_id NOT NULL,
visible only under their resource) and standalone notes (resource_id NULL,
managed through the top-level /api/v1/notes collection). A note moves between
scopes only through the dedicated versioned operations: attach (standalone ->
a readable resource) and detach (a resource -> standalone); content writes
never change the binding.
"""

from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from studypilot.modules.notes.contracts import NoteError, NoteQuery

from .models import LearningResource, Note, OriginalFile

FIELDS = ("id", "resource_id", "content", "version", "created_at", "updated_at")


def project(note: Note) -> dict[str, Any]:
    return {field: getattr(note, field) for field in FIELDS}


class NoteStore:
    def __init__(self, session: Session) -> None:
        self.session = session

    def require_resource(self, resource_id: UUID) -> None:
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
            raise NoteError("RESOURCE_NOT_FOUND", 404)

    def find(self, resource_id: UUID, note_id: UUID) -> Note:
        self.require_resource(resource_id)
        note = self.session.scalar(
            select(Note).where(Note.id == note_id, Note.resource_id == resource_id)
        )
        if note is None:
            raise NoteError("NOTE_NOT_FOUND", 404)
        return note

    @staticmethod
    def check_version(note: Note, expected: int) -> None:
        if note.version != expected:
            raise NoteError("VERSION_CONFLICT", 409, {"current_version": note.version})

    # -- attached-note operations (unchanged semantics) -----------------------

    def create(self, resource_id: UUID, content: str) -> dict[str, Any]:
        self.require_resource(resource_id)
        note = Note(resource_id=resource_id, content=content)
        self.session.add(note)
        self.session.flush()
        return project(note)

    def detail(self, resource_id: UUID, note_id: UUID) -> dict[str, Any]:
        return project(self.find(resource_id, note_id))

    def update(
        self, resource_id: UUID, note_id: UUID, content: str, expected: int
    ) -> dict[str, Any]:
        note = self.find(resource_id, note_id)
        self.check_version(note, expected)
        if note.content != content:
            note.content = content
        self.session.flush()  # ORM guards version and updates time only for actual changes.
        return project(note)

    def delete(self, resource_id: UUID, note_id: UUID, expected: int) -> None:
        note = self.find(resource_id, note_id)
        self.check_version(note, expected)
        self.session.delete(note)
        self.session.flush()  # Version is included in DELETE, not just the earlier check.

    def page(self, resource_id: UUID, query: NoteQuery) -> dict[str, Any]:
        self.require_resource(resource_id)
        return self._page(Note.resource_id == resource_id, query)

    # -- standalone-note operations (resource_id IS NULL) --------------------

    def create_standalone(self, content: str) -> dict[str, Any]:
        note = Note(resource_id=None, content=content)
        self.session.add(note)
        self.session.flush()
        return project(note)

    def detail_standalone(self, note_id: UUID) -> dict[str, Any]:
        return project(self.standalone(note_id))

    def update_standalone(self, note_id: UUID, content: str, expected: int) -> dict[str, Any]:
        note = self.standalone(note_id)
        self.check_version(note, expected)
        if note.content != content:
            note.content = content
        self.session.flush()
        return project(note)

    def delete_standalone(self, note_id: UUID, expected: int) -> None:
        note = self.standalone(note_id)
        self.check_version(note, expected)
        self.session.delete(note)
        self.session.flush()

    def page_standalone(self, query: NoteQuery) -> dict[str, Any]:
        return self._page(Note.resource_id.is_(None), query)

    # -- scope-move operations (versioned writes; content unchanged) --------

    def attach(self, note_id: UUID, resource_id: UUID, expected: int) -> dict[str, Any]:
        """Bind a currently standalone note to a readable resource.

        Both sides are guarded: the target must be readable (WEB/PASTE, or a
        FILE with a READY original) and the note must still be standalone,
        otherwise NOTE_NOT_FOUND. Only the binding changes; the ORM bumps
        version and updated_at because resource_id actually changed.
        """
        self.require_resource(resource_id)
        note = self.standalone(note_id)
        self.check_version(note, expected)
        note.resource_id = resource_id
        self.session.flush()
        return project(note)

    def detach(self, resource_id: UUID, note_id: UUID, expected: int) -> dict[str, Any]:
        """Release a note bound to ``resource_id`` back to standalone.

        The note must still be bound to that exact resource, otherwise
        NOTE_NOT_FOUND. Only the binding changes; version and updated_at bump.
        """
        note = self.find(resource_id, note_id)
        self.check_version(note, expected)
        note.resource_id = None
        self.session.flush()
        return project(note)

    # -- shared helpers -------------------------------------------------------

    def standalone(self, note_id: UUID) -> Note:
        """Read a standalone Note by id; raises NOTE_NOT_FOUND if missing or attached."""
        note = self.session.scalar(
            select(Note).where(Note.id == note_id, Note.resource_id.is_(None))
        )
        if note is None:
            raise NoteError("NOTE_NOT_FOUND", 404)
        return note

    def _page(self, scope: Any, query: NoteQuery) -> dict[str, Any]:
        total = int(self.session.scalar(select(func.count()).select_from(Note).where(scope)) or 0)
        column = getattr(Note, query.sort.lstrip("-"))
        offset = (query.page - 1) * query.page_size
        rows = self.session.scalars(
            select(Note)
            .where(scope)
            .order_by(column.desc() if query.sort.startswith("-") else column, Note.id)
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
