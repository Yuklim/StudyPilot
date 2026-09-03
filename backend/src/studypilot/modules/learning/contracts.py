"""The three approved study-record operations, without storage side effects."""

import re
from typing import Literal, Self
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

Status = Literal["UNREAD", "IN_PROGRESS", "COMPLETED", "REVIEW_DUE", "ARCHIVED"]


class LearningError(Exception):
    def __init__(self, code: str, status: int, details: dict[str, int] | None = None) -> None:
        self.code, self.status, self.details = code, status, details or {}
        super().__init__(code)


def timestamp(value: object) -> object:
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})",
        value,
    ):
        raise ValueError("use a zoned timestamp")
    return value


class StudyRecordCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    expected_progress_version: int = Field(ge=1)
    # The before-validator preserves RFC 3339 syntax; permit only this field's
    # checked string to become a datetime, while numeric command fields stay strict.
    started_at: AwareDatetime = Field(strict=False)
    duration_seconds: int = Field(ge=0, le=86_400)
    progress_before: int = Field(ge=0, le=100)
    progress_after: int = Field(ge=0, le=100)
    status_before: Status
    status_after: Status
    summary: str | None = Field(default=None, max_length=5000)
    questions_next: str | None = Field(default=None, max_length=5000)

    _timestamp = field_validator("started_at", mode="before")(timestamp)


class RecordQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    started_from: AwareDatetime | None = None
    started_to: AwareDatetime | None = None
    sort: Literal[
        "started_at",
        "-started_at",
        "created_at",
        "-created_at",
        "duration_seconds",
        "-duration_seconds",
    ] = "-started_at"

    _timestamp = field_validator("started_from", "started_to", mode="before")(timestamp)

    @field_validator("page", "page_size", mode="before")
    @classmethod
    def integer_query(cls, value: object) -> object:
        if not isinstance(value, str) or not re.fullmatch(r"[0-9]+", value):
            raise ValueError("use an integer")
        return value

    @model_validator(mode="after")
    def ordered_range(self) -> Self:
        if (
            self.started_from is not None
            and self.started_to is not None
            and self.started_from > self.started_to
        ):
            raise ValueError("reversed time range")
        return self


class GlobalRecordQuery(RecordQuery):
    resource_id: UUID | None = None
    topic_id: UUID | None = None
