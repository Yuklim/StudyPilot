"""Pure validation for reading highlights: what a marked passage carries.

A highlight is an anchor, not a position. `exact` is the passage itself, with
`prefix`/`suffix` as the context that tells repeated wording apart, and the
offsets kept only as a fallback when the text above has shifted (W3C Web
Annotation model, docs/research 5.1). Nothing here reads the snapshot: whether
an anchor still lands is decided by the reader when it renders.
"""

import re
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

# The longest passage that can be marked at once, same ceiling as the reader's
# quote (TASK-068): past a couple of thousand characters a "highlight" is the
# article, and the anchor stops being about one idea.
MAX_EXACT = 2_000
MAX_CONTEXT = 200
Exact = Annotated[str, StringConstraints(min_length=1, max_length=MAX_EXACT)]
Context = Annotated[str, StringConstraints(max_length=MAX_CONTEXT)]


class HighlightError(Exception):
    def __init__(self, code: str, status: int, details: dict[str, int] | None = None) -> None:
        self.code, self.status, self.details = code, status, details or {}
        super().__init__(code)


class HighlightCreate(BaseModel):
    """The anchor, plus the note it was written about if there already is one.

    The text is taken verbatim - no trimming. Leading and trailing spaces are
    part of what the reader selected, and dropping them would move the anchor.
    """

    model_config = ConfigDict(extra="forbid", strict=True)
    exact: Exact
    prefix: Context | None = None
    suffix: Context | None = None
    start_offset: int = Field(ge=0)
    end_offset: int = Field(ge=1)
    note_id: UUID | None = None

    @model_validator(mode="after")
    def ordered(self) -> Self:
        if self.end_offset <= self.start_offset:
            raise ValueError("end_offset must be greater than start_offset")
        return self


class HighlightPatch(BaseModel):
    """Only the note binding moves.

    The anchor is deliberately immutable: letting it change would turn one
    highlight into a mark on entirely different words while keeping its history.
    Marking another passage is another highlight.

    `note_id` is **required and may be null**: null unbinds, and leaving the field
    out is refused. A caller that forgot the field almost never meant "throw away
    the note this passage is about", and silently doing it is the kind of loss the
    user only notices much later (first-round Review, F4).
    """

    model_config = ConfigDict(extra="forbid", strict=True)
    note_id: UUID | None
    expected_version: int = Field(ge=1)


class HighlightQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    # Reading order by default: a reader wants its marks the way they appear in
    # the article, not the order they happened to be made in.
    sort: Literal["start_offset", "-start_offset", "created_at", "-created_at"] = "start_offset"

    @field_validator("page", "page_size", mode="before")
    @classmethod
    def integer_query(cls, value: object) -> object:
        if not isinstance(value, str) or not re.fullmatch(r"[0-9]+", value):
            raise ValueError("use an integer")
        return value
