"""Pure validation for reading highlights: what a marked passage carries.

A highlight is an anchor, not a position. `exact` is the passage itself, with
`prefix`/`suffix` as the context that tells repeated wording apart, and the
offsets kept only as a fallback when the text above has shifted (W3C Web
Annotation model, docs/research 5.1). Nothing here reads the snapshot: whether
an anchor still lands is decided by the reader when it renders.
"""

import re
from typing import Annotated, Any, Literal, Self
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
# The look (TASK-093): what the toolbar offers, nothing more. `mark` fills the
# passage, `underline` draws under it; the four colours are shared by both.
Style = Literal["mark", "underline"]
Color = Literal["yellow", "green", "blue", "pink"]
LOOK_FIELDS = frozenset({"note_id", "style", "color"})


class HighlightError(Exception):
    def __init__(self, code: str, status: int, details: dict[str, int] | None = None) -> None:
        self.code, self.status, self.details = code, status, details or {}
        super().__init__(code)


class HighlightCreate(BaseModel):
    """The anchor, plus the note it was written about if there already is one.

    The text is taken verbatim - no trimming. Leading and trailing spaces are
    part of what the reader selected, and dropping them would move the anchor.

    `page_number` (TASK-089) says where the offsets are measured: None is the
    resource's snapshot text, a value is that page of its PDF original (1-based).
    Whether the resource actually has the thing named is the store's check, not
    this model's - here only the shape is validated.
    """

    model_config = ConfigDict(extra="forbid", strict=True)
    exact: Exact
    prefix: Context | None = None
    suffix: Context | None = None
    start_offset: int = Field(ge=0)
    end_offset: int = Field(ge=1)
    page_number: int | None = Field(default=None, ge=1)
    style: Style = "mark"
    color: Color = "yellow"
    note_id: UUID | None = None

    @model_validator(mode="after")
    def ordered(self) -> Self:
        if self.end_offset <= self.start_offset:
            raise ValueError("end_offset must be greater than start_offset")
        return self


class HighlightPatch(BaseModel):
    """The note binding and the look move; the anchor never does.

    The anchor is deliberately immutable: letting it change would turn one
    highlight into a mark on entirely different words while keeping its history.
    Marking another passage is another highlight.

    Three fields can change - `note_id`, `style`, `color` - and a request names
    only the ones it means to change: **a field left out is left alone**, and a
    request that names none is refused (there is nothing to do). `note_id: null`
    is the one way to unbind. TASK-071 had a single field and therefore refused a
    missing `note_id` outright (first-round Review, F4: a forgotten field must not
    quietly throw the note away); with three fields "left out = untouched" is the
    rule that keeps that promise - forgetting a field can never lose anything.
    `style`/`color` are not nullable: null there is a shape error, not "reset".
    """

    model_config = ConfigDict(extra="forbid", strict=True)
    note_id: UUID | None = None
    style: Style | None = None
    color: Color | None = None
    expected_version: int = Field(ge=1)

    @model_validator(mode="after")
    def names_something_to_change(self) -> Self:
        named = self.model_fields_set & LOOK_FIELDS
        if not named:
            raise ValueError("name at least one of note_id, style, color")
        for field in ("style", "color"):
            if field in named and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self

    def changes(self) -> dict[str, Any]:
        """Only the fields the request actually named, `note_id` possibly None."""
        return {field: getattr(self, field) for field in self.model_fields_set & LOOK_FIELDS}


class HighlightQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    # Reading order by default: a reader wants its marks the way they appear in
    # the article, not the order they happened to be made in. `start_offset` is
    # the name the contract has always used for that order; since TASK-089 the
    # store sorts it as (page_number NULLS FIRST, start_offset, id) so a PDF's
    # marks come page by page.
    sort: Literal["start_offset", "-start_offset", "created_at", "-created_at"] = "start_offset"

    @field_validator("page", "page_size", mode="before")
    @classmethod
    def integer_query(cls, value: object) -> object:
        if not isinstance(value, str) or not re.fullmatch(r"[0-9]+", value):
            raise ValueError("use an integer")
        return value
