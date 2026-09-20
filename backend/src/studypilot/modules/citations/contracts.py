"""Pure validation for a resource's bibliographic metadata: who wrote it, when, where.

These are the fields a citation manager needs and the existing resource fields
cannot carry: an ordered author list, the year, the journal or book the work
appeared in, and the identifiers (DOI/ISBN) that name the work rather than a web
address. `title` and `source_url` stay on the resource - they are how the user
finds the thing they saved; everything here describes the work itself.

Nothing in this module reaches the network. A DOI is stored as the caller typed
it: the server never resolves it, never asks Crossref and never claims the work
exists. The one thing it does enforce is shape, so a later export or search has
something regular to read.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

# CSL/Zotero item types, cut down to the kinds a personal library actually holds.
# `OTHER` is the default because an unclassified reference is still a reference;
# forcing a guess would put invented data in a field meant to be trustworthy.
ITEM_TYPES = (
    "JOURNAL_ARTICLE",
    "PREPRINT",
    "CONFERENCE_PAPER",
    "BOOK",
    "BOOK_CHAPTER",
    "THESIS",
    "REPORT",
    "WEBPAGE",
    "OTHER",
)
ItemType = Literal[
    "JOURNAL_ARTICLE",
    "PREPRINT",
    "CONFERENCE_PAPER",
    "BOOK",
    "BOOK_CHAPTER",
    "THESIS",
    "REPORT",
    "WEBPAGE",
    "OTHER",
]
MAX_AUTHORS = 100
MAX_AUTHOR = 200
MIN_YEAR = 1_000
MAX_YEAR = 2_200
MAX_ABSTRACT = 20_000

# Trimmed, non-blank, bounded - the same rule the resource title already uses.
# Clearing a field is `null`, not `""`: an empty string would be a second way to
# say "unknown", and two spellings of one fact is what makes a later search or
# export unreliable.
Author = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Locator = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
Stamp = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Container = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
Abstract = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20_000)]


class CitationError(Exception):
    """Stable code/status, never user content, SQL or a file path."""

    def __init__(self, code: str, status: int, details: dict[str, int] | None = None) -> None:
        self.code, self.status, self.details = code, status, details or {}
        super().__init__(code)


class CitationPut(BaseModel):
    """The whole citation in one body: writing it again replaces it, never merges.

    Every field is optional, so an omitted field means "this work has no such
    value" and clears whatever was recorded. That is deliberate: a field-level
    merge makes it impossible to remove a wrong author or a mistyped DOI without
    inventing a "null means delete" convention on top, and the caller already
    holds the complete record it just read.

    `expected_version` is absent on the first write (there is nothing to replace)
    and required once a citation exists, mirroring the snapshot rules.
    """

    model_config = ConfigDict(extra="forbid", strict=True)
    item_type: ItemType = "OTHER"
    # Order is data: an author list is cited in the order the work prints it.
    authors: list[Author] | None = Field(default=None, max_length=MAX_AUTHORS)
    issued_year: int | None = Field(default=None, ge=MIN_YEAR, le=MAX_YEAR)
    # Kept verbatim, not parsed: pages print dates as "2024-03", "Spring 2024" or
    # "2024年3月", and deriving a calendar date from those invents precision.
    issued_date: Stamp | None = None
    container_title: Container | None = None
    volume: Locator | None = None
    issue: Locator | None = None
    pages: Locator | None = None
    publisher: Name | None = None
    doi: Name | None = None
    isbn: Stamp | None = None
    abstract: Abstract | None = None
    expected_version: int | None = Field(default=None, ge=1)

    @field_validator("authors")
    @classmethod
    def drop_empty(cls, value: list[str] | None) -> list[str] | None:
        # An empty list already means "no authors recorded", which is what NULL
        # means; keeping both would give one fact two shapes to search for.
        return value or None
