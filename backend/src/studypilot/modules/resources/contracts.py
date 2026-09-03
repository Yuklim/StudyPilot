"""Validated resource commands; no HTTP, database or network side effects."""

import re
from typing import Annotated, Literal, Self
from unicodedata import normalize
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    TypeAdapter,
    field_validator,
    model_validator,
)

Source = Literal["WEB", "PASTE", "FILE"]
Status = Literal["UNREAD", "IN_PROGRESS", "COMPLETED", "REVIEW_DUE", "ARCHIVED"]


class ResourceError(Exception):
    """Only a stable code and HTTP status, never user content or SQL."""

    def __init__(self, code: str, status: int) -> None:
        self.code = code
        self.status = status
        super().__init__(code)


def normalized_search(value: str) -> str:
    return " ".join(normalize("NFKC", value).casefold().split())


class CreateBase(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    source_name: str | None = Field(default=None, max_length=120)
    save_reason: str | None = Field(default=None, max_length=1000)
    topic_id: UUID | None = None
    tag_ids: list[UUID] = Field(default_factory=list, max_length=20)

    @field_validator("tag_ids")
    @classmethod
    def distinct_tags(cls, value: list[UUID]) -> list[UUID]:
        if len(set(value)) != len(value):
            raise ValueError("duplicate tags")
        return value


class WebCreate(CreateBase):
    source_type: Literal["WEB"]
    source_url: str = Field(max_length=2048)

    @field_validator("source_url")
    @classmethod
    def parsed_url(cls, value: str) -> str:
        # Parse without fetching. Reject parser-stripped whitespace/control input.
        if not value.startswith(("http://", "https://")) or any(
            character.isspace() or ord(character) < 32 or character == "\\" for character in value
        ):
            raise ValueError("invalid source URL")
        parsed = urlsplit(value)
        if (
            not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or "#" in value
            or "@" in parsed.netloc
        ):
            raise ValueError("invalid source URL")
        # Access validates numeric/range syntax, including malformed ports.
        _ = parsed.port
        return value


class PasteCreate(CreateBase):
    source_type: Literal["PASTE"]
    pasted_content: str = Field(min_length=1, max_length=1_000_000)


CreateResource = WebCreate | PasteCreate
CREATE_RESOURCE: TypeAdapter[CreateResource] = TypeAdapter(
    Annotated[CreateResource, Field(discriminator="source_type")]
)


class ResourceQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    q: str | None = Field(default=None, min_length=1, max_length=200)
    topic_id: UUID | None = None
    topic_unassigned: bool = False
    tag_id: list[UUID] = Field(default_factory=list)
    source_type: list[Source] = Field(default_factory=list)
    learning_status: list[Status] = Field(default_factory=list)
    progress_min: int | None = Field(default=None, ge=0, le=100)
    progress_max: int | None = Field(default=None, ge=0, le=100)
    created_from: AwareDatetime | None = None
    created_to: AwareDatetime | None = None
    updated_from: AwareDatetime | None = None
    updated_to: AwareDatetime | None = None
    sort: Literal[
        "created_at",
        "-created_at",
        "updated_at",
        "-updated_at",
        "title",
        "-title",
        "progress_percent",
        "-progress_percent",
    ] = "-created_at"

    @field_validator("page", "page_size", "progress_min", "progress_max", mode="before")
    @classmethod
    def query_integer(cls, value: object) -> object:
        if not isinstance(value, str) or not re.fullmatch(r"[0-9]+", value):
            raise ValueError("use an integer")
        return value

    @field_validator("topic_unassigned", mode="before")
    @classmethod
    def query_boolean(cls, value: object) -> object:
        if value not in ("true", "false"):
            raise ValueError("use true or false")
        return value == "true"

    @field_validator("created_from", "created_to", "updated_from", "updated_to", mode="before")
    @classmethod
    def timestamp(cls, value: object) -> object:
        if not isinstance(value, str) or not re.fullmatch(
            r"\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})",
            value,
        ):
            raise ValueError("use a zoned timestamp")
        return value

    @model_validator(mode="after")
    def valid_ranges(self) -> Self:
        if self.q is not None and not normalized_search(self.q):
            raise ValueError("empty search")
        if self.topic_id is not None and self.topic_unassigned:
            raise ValueError("exclusive topic filters")
        if (
            self.progress_min is not None
            and self.progress_max is not None
            and self.progress_min > self.progress_max
        ):
            raise ValueError("reversed progress range")
        for start, end in (
            (self.created_from, self.created_to),
            (self.updated_from, self.updated_to),
        ):
            if start is not None and end is not None and start > end:
                raise ValueError("reversed date range")
        return self
