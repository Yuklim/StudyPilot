"""Pure validation for the approved personal-note contract."""

import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

Content = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50_000)]


class NoteError(Exception):
    def __init__(self, code: str, status: int, details: dict[str, int] | None = None) -> None:
        self.code, self.status, self.details = code, status, details or {}
        super().__init__(code)


class NoteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    content: Content


class NotePatch(NoteCreate):
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
