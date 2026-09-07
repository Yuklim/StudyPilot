"""Pure validation for frozen snapshot assets; no filesystem, ORM or HTTP imports.

An asset is one image that belonged to a snapshot's text when it was captured.
The bytes always arrive from the caller: the backend never fetches anything.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, BinaryIO, Protocol
from unicodedata import category
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

# Per-image ceiling, well under the 25 MiB the controlled storage accepts for an
# uploaded original. No per-snapshot count limit exists: the user decided on
# 2026-09-06 that a page's images are frozen whole, whatever the disk cost.
MAX_ASSET_BYTES = 10 * 1024 * 1024

# Four raster formats. SVG is deliberately absent: it is executable XML that can
# carry scripts and external references, and freezing one would put a foreign
# site's script inside the controlled directory, same-origin with the local UI.
IMAGE_MEDIA_TYPES = ("image/png", "image/jpeg", "image/gif", "image/webp")

AssetSourceUrl = Annotated[str, StringConstraints(min_length=1, max_length=2048)]


@dataclass(frozen=True)
class AssetBytes:
    """What recognition established about one uploaded image."""

    media_type: str
    size_bytes: int
    sha256: str
    staging_key: str
    storage_key: str


@dataclass(frozen=True)
class AssetRecord:
    """A detached copy of one asset row, safe to use after the session closes."""

    id: UUID
    snapshot_id: UUID
    source_url: str
    media_type: str
    size_bytes: int
    sha256: str
    storage_key: str
    created_at: datetime


class AssetUpload(BaseModel):
    """The only caller-supplied field: where this image sat in the captured page.

    It is a matching key, never a fetch target — the backend does not resolve it.
    Renderers use it to swap the original address in the frozen text for the local
    asset, which is why the text itself is never rewritten.
    """

    model_config = ConfigDict(extra="forbid", strict=True)
    source_url: AssetSourceUrl

    @field_validator("source_url")
    @classmethod
    def absolute_web_url(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            raise ValueError("source_url must be an absolute http(s) address")
        if any(category(c).startswith("C") or c.isspace() for c in value):
            raise ValueError("source_url cannot contain control or space characters")
        return value


class AssetStorage(Protocol):
    """The slice of controlled storage an asset needs.

    Narrower than `FileStorage` on purpose: assets have no staging_key column, no
    PENDING state and no reconciliation, so they never need `orphans` or the
    recovery helpers.
    """

    def begin(self) -> tuple[str, BinaryIO]: ...
    def inspect_image(self, key: str) -> AssetBytes: ...
    def read(self, key: str, size: int, digest: str) -> bytes: ...
    def promote(self, source: str, destination: str, size: int, digest: str) -> None: ...
    def exists(self, key: str) -> bool: ...
    def discard(self, key: str) -> None: ...
    def quarantine(self, key: str) -> None: ...
