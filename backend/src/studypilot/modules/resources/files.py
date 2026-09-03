"""Storage port and immutable file descriptors; no filesystem or ORM imports."""

from dataclasses import dataclass
from datetime import datetime
from typing import BinaryIO, Protocol

MAX_FILE_BYTES = 26_214_400


@dataclass(frozen=True)
class FileContent:
    original_name: str
    size_bytes: int
    media_type: str
    sha256: str
    staging_key: str
    storage_key: str


class FileStorage(Protocol):
    def begin(self) -> tuple[str, BinaryIO]: ...
    def inspect(self, key: str, name: str, declared_type: str) -> FileContent: ...
    def read(self, key: str, size: int, digest: str) -> bytes: ...
    def promote(self, source: str, destination: str, size: int, digest: str) -> None: ...
    def exists(self, key: str) -> bool: ...
    def discard(self, key: str) -> None: ...
    def quarantine(self, key: str) -> None: ...
    def orphans(self, before: datetime) -> list[str]: ...


def trash_key(storage_key: str) -> str:
    return storage_key.replace("objects/", "trash/", 1)
