"""Pure validation; taxonomy never changes resource or learning state."""

import re
from typing import Annotated, Literal, Self
from unicodedata import normalize
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

Kind = Literal["topic", "tag"]
TopicName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
TagName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


def normalized_name(value: str) -> str:
    return " ".join(normalize("NFKC", value).casefold().split())


class TaxonomyError(Exception):
    def __init__(self, code: str, status: int, details: dict[str, int] | None = None) -> None:
        self.code, self.status, self.details = code, status, details or {}
        super().__init__(code)


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class TopicCreate(Command):
    name: TopicName
    description: str | None = Field(default=None, max_length=500)


class TagCreate(Command):
    name: TagName


class Patch(Command):
    expected_version: int = Field(ge=1)

    @model_validator(mode="after")
    def has_change(self) -> Self:
        if not self.model_fields_set - {"expected_version"}:
            raise ValueError("provide a change")
        return self


class TopicPatch(Patch):
    name: TopicName | None = None
    description: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def name_not_null(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("name cannot be null")
        return value


class TagPatch(Patch):
    name: TagName


class BulkCommand(Command):
    """Batch association writes carry the count the caller was looking at.

    These operations can touch any number of resource_tags rows at once, and the
    count is now visible in the UI (TASK-034), so the number the user decided on
    has to take part in the guard: a mismatch aborts before anything is written.
    """

    expected_resource_count: int = Field(ge=0)


class TagDetachAll(BulkCommand):
    pass


class TagMerge(BulkCommand):
    target_tag_id: UUID
    expected_version: int = Field(ge=1)


class TaxonomyQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    q: str | None = Field(default=None, min_length=1, max_length=80)
    sort: Literal["name", "-name", "created_at", "-created_at"] = "name"

    @field_validator("page", "page_size", mode="before")
    @classmethod
    def integer_query(cls, value: object) -> object:
        if not isinstance(value, str) or not re.fullmatch(r"[0-9]+", value):
            raise ValueError("use an integer")
        return value

    @field_validator("q")
    @classmethod
    def nonempty_search(cls, value: str | None) -> str | None:
        if value is not None and not normalized_name(value):
            raise ValueError("empty search")
        return value
