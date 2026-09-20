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

from studypilot.modules.notes.contracts import (
    NoteError,
    NoteQuery,
    StandaloneNoteQuery,
    normalized_search,
    note_title,
)

from .models import LearningResource, Note, OriginalFile

FIELDS = ("id", "resource_id", "content", "version", "created_at", "updated_at")

# TASK-070: how much of each note to read while matching a title search. A note
# can hold 2,000,000 characters once images are pasted in as base64, so pulling
# whole bodies to look at their first line would be absurd. The title lives in
# the opening lines, and the rare note that opens with a big image falls back to
# one full read of that single row (see `_search_title`).
TITLE_PREFIX = 4000


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

    def page_standalone(self, query: StandaloneNoteQuery) -> dict[str, Any]:
        return self._page(Note.resource_id.is_(None), query, q=query.q)

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

    def _search_title(self, note_id: UUID, prefix: str) -> str | None:
        """The searchable title of one note, read from its opening characters.

        `prefix` holds at most TITLE_PREFIX + 1 characters. When it is longer than
        TITLE_PREFIX the body continues past what was read, so its final line may
        be cut in half: derive from the complete lines only, and if no title is
        found among them, read that one note in full. Dropping a line that merely
        looked incomplete costs an extra read, never a wrong answer.
        """
        if len(prefix) <= TITLE_PREFIX:
            return note_title(prefix)
        complete = prefix[:TITLE_PREFIX].splitlines()[:-1]
        title = note_title("\n".join(complete))
        if title is not None:
            return title
        return note_title(self.session.scalar(select(Note.content).where(Note.id == note_id)) or "")

    def _page(self, scope: Any, query: NoteQuery, q: str | None = None) -> dict[str, Any]:
        column = getattr(Note, query.sort.lstrip("-"))
        ordering = (column.desc() if query.sort.startswith("-") else column, Note.id)
        offset = (query.page - 1) * query.page_size
        if q is None:
            total = int(
                self.session.scalar(select(func.count()).select_from(Note).where(scope)) or 0
            )
            rows = list(
                self.session.scalars(
                    select(Note)
                    .where(scope)
                    .order_by(*ordering)
                    .offset(offset)
                    .limit(query.page_size)
                )
            )
        else:
            # TASK-070: contract 2.3 matching is NFKC + case folding + whitespace
            # folding, which SQLite cannot do, so the comparison happens here -
            # the same shape the resource search already uses. Only the opening
            # characters of each note travel; full rows are read for one page.
            needle = normalized_search(q)
            ordered = self.session.execute(
                select(Note.id, func.substr(Note.content, 1, TITLE_PREFIX + 1))
                .where(scope)
                .order_by(*ordering)
            )
            matched = [
                note_id
                for note_id, prefix in ordered
                if (title := self._search_title(note_id, prefix)) is not None
                and needle in normalized_search(title)
            ]
            total = len(matched)
            wanted = matched[offset : offset + query.page_size]
            found = {
                row.id: row for row in self.session.scalars(select(Note).where(Note.id.in_(wanted)))
            }
            rows = [found[note_id] for note_id in wanted if note_id in found]
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
