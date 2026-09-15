"""Pure validation for the approved personal-note contract."""

import re
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

# TASK-063: images are pasted into notes as base64 data URIs inside the Markdown
# (user-chosen storage), so the ceiling is 2,000,000 characters (roughly 5-10
# compressed screenshots). Lower bound, trimming and versioned writes are unchanged.
MAX_CONTENT = 2_000_000
Content = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_CONTENT)
]


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
