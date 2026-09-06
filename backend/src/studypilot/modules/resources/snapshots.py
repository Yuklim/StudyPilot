"""Pure validation for the frozen content snapshot contract."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

# Same ceiling as pasted_content: a snapshot is the same kind of text asset.
SnapshotContent = Annotated[str, StringConstraints(min_length=1, max_length=1_000_000)]
MANUAL_EXTRACTOR = "manual"


class SnapshotPut(BaseModel):
    """Whole-snapshot write: saving again replaces the frozen copy, never appends.

    `expected_version` is absent on the first write (there is nothing to replace) and
    required once a snapshot exists, mirroring the version rules of the other
    JSON writes.
    """

    model_config = ConfigDict(extra="forbid", strict=True)
    content: SnapshotContent
    format: Literal["MARKDOWN"] = "MARKDOWN"
    captured_from_url: str | None = Field(default=None, max_length=2048)
    expected_version: int | None = Field(default=None, ge=1)

    @field_validator("content")
    @classmethod
    def not_blank(cls, value: str) -> str:
        # Whitespace is kept verbatim — the snapshot is a copy — but a snapshot made
        # of nothing but whitespace is not a snapshot.
        if not value.strip():
            raise ValueError("content cannot be blank")
        return value
