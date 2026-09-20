"""Pure validation for the approved personal-note contract."""

import re
from typing import Annotated, Literal
from unicodedata import normalize
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

# TASK-063: images are pasted into notes as base64 data URIs inside the Markdown
# (user-chosen storage), so the ceiling is 2,000,000 characters (roughly 5-10
# compressed screenshots). Lower bound, trimming and versioned writes are unchanged.
MAX_CONTENT = 2_000_000
Content = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_CONTENT)
]


# TASK-070: notes have no title column - the page shows the first usable line as
# the title, the way a memo app does. Search matches that same derived line, so
# the two sides cannot drift: `frontend/src/features/notes/noteTitle.ts` holds the
# identical rule, and both are pinned by tests.
IMAGE = re.compile(r"!\[([^\]]*)\]\([^)]*\)")
HEADING = re.compile(r"^\s*#{1,6}\s+")


def normalized_search(value: str) -> str:
    """Contract 2.3 text matching: NFKC, case folding, whitespace folding."""
    return " ".join(normalize("NFKC", value).casefold().split())


def note_title(content: str) -> str | None:
    """The first line a reader would take as the title, or None if there is none.

    Same rule as the page: drop a leading Markdown heading marker, keep only the
    alt text of inline images (an embedded image is a huge base64 blob, never a
    title), skip blank and image-only lines. **Not truncated** - the page cuts the
    title at 60 characters for display only, and search should not stop there.
    """
    for raw in content.splitlines():
        line = IMAGE.sub(lambda match: match.group(1).strip(), HEADING.sub("", raw)).strip()
        if line:
            return line
    return None


class NoteError(Exception):
    def __init__(self, code: str, status: int, details: dict[str, int] | None = None) -> None:
        self.code, self.status, self.details = code, status, details or {}
        super().__init__(code)


class NoteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    content: Content


class NotePatch(NoteCreate):
    expected_version: int = Field(ge=1)


class NoteAttach(BaseModel):
    """Bind a currently standalone note (top-level /notes) to a readable resource."""

    model_config = ConfigDict(extra="forbid", strict=True)
    resource_id: UUID
    expected_version: int = Field(ge=1)


class NoteDetach(BaseModel):
    """Release a bound note (under a resource) back to a standalone note."""

    model_config = ConfigDict(extra="forbid", strict=True)
    expected_version: int = Field(ge=1)


class NoteQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    sort: Literal["created_at", "-created_at", "updated_at", "-updated_at"] = "-created_at"

    @field_validator("page", "page_size", mode="before")
    @classmethod
    def integer_query(cls, value: object) -> object:
        if not isinstance(value, str) or not re.fullmatch(r"[0-9]+", value):
            raise ValueError("use an integer")
        return value


class StandaloneNoteQuery(NoteQuery):
    """The top-level /api/v1/notes listing, which also accepts a title search.

    TASK-070: only this collection takes `q`. The per-resource listing keeps the
    plain `NoteQuery`, so `GET /resources/{id}/notes?q=x` still fails validation
    (extra="forbid") instead of silently ignoring the parameter - contract 2.3
    requires unknown query parameters to be rejected.
    """

    q: str | None = Field(default=None, min_length=1, max_length=200)
