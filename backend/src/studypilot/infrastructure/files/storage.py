"""Private random-key local storage. No uploaded name is used as a path."""

import hashlib
import os
import re
import stat
from datetime import datetime
from pathlib import Path
from typing import BinaryIO
from uuid import uuid4

from studypilot.infrastructure.files.formats import recognize, safe_name
from studypilot.infrastructure.files.images import recognize_image
from studypilot.modules.resources.assets import MAX_ASSET_BYTES, AssetBytes
from studypilot.modules.resources.contracts import ResourceError
from studypilot.modules.resources.files import MAX_FILE_BYTES, FileContent, trash_key

KEY = re.compile(r"(staging|objects|trash)/[0-9a-f]{32}\Z")


class LocalFileStorage:
    def __init__(self, root: Path) -> None:
        # Resolve configuration, not an uploaded name. No directory is created here.
        configured = Path(os.path.abspath(root))
        # Canonicalize configured ancestors (e.g. macOS /var -> /private/var)
        # once at startup. The controlled root itself may not be a symlink.
        self.root = configured.parent.resolve() / configured.name

    def _directory(self, name: str, *, create: bool = False) -> Path:
        try:
            if self.root.resolve() != self.root:
                raise OSError
            if create:
                missing = []
                parent = self.root
                while not parent.exists():
                    missing.append(parent)
                    parent = parent.parent
                self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
                for path in missing:
                    self._sync(path)
                    self._sync(path.parent)
            directory = self.root / name
            if create:
                new_directory = not directory.exists()
                directory.mkdir(exist_ok=True, mode=0o700)
                if new_directory:
                    self._sync(directory)
                    self._sync(self.root)
            if (
                not self.root.is_dir()
                or directory.is_symlink()
                or not directory.is_dir()
                or directory.stat().st_dev != self.root.stat().st_dev
            ):
                raise OSError
            return directory
        except OSError:
            raise ResourceError("STORAGE_PATH_UNAVAILABLE", 503) from None

    def _path(self, key: str, *, create: bool = False) -> Path:
        if not KEY.fullmatch(key):
            raise ResourceError("STORAGE_PATH_UNAVAILABLE", 503)
        area, name = key.split("/")
        return self._directory(area, create=create) / name

    def _sync(self, directory: Path) -> None:
        descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

    def begin(self) -> tuple[str, BinaryIO]:
        key = f"staging/{uuid4().hex}"
        path = self._path(key, create=True)
        try:
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            return key, os.fdopen(descriptor, "wb")
        except OSError:
            raise ResourceError("STORAGE_PATH_UNAVAILABLE", 503) from None

    def _bytes(self, key: str) -> bytes:
        path = self._path(key)
        try:
            descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            with os.fdopen(descriptor, "rb") as stream:
                info = os.fstat(stream.fileno())
                if not stat.S_ISREG(info.st_mode) or not 1 <= info.st_size <= MAX_FILE_BYTES:
                    raise ResourceError("FILE_CORRUPTED", 409)
                data = stream.read(MAX_FILE_BYTES + 1)
            if not 1 <= len(data) <= MAX_FILE_BYTES:
                raise ResourceError("FILE_CORRUPTED", 409)
            return data
        except FileNotFoundError:
            raise ResourceError("FILE_CORRUPTED", 409) from None
        except OSError:
            raise ResourceError("STORAGE_PATH_UNAVAILABLE", 503) from None

    def inspect(self, key: str, name: str, declared_type: str) -> FileContent:
        data = self._bytes(key)
        name = safe_name(name)
        media_type = recognize(data, name, declared_type)
        self._sync(self._path(key).parent)
        return FileContent(
            name,
            len(data),
            media_type,
            hashlib.sha256(data).hexdigest(),
            key,
            f"objects/{uuid4().hex}",
        )

    def inspect_image(self, key: str) -> AssetBytes:
        """Recognize a staged image from its bytes alone; never from a filename.

        An asset has no user-supplied name to sanitize and no container to parse,
        so this shares `_bytes` with `inspect` but stops at the signature check.
        """

        data = self._bytes(key)
        # The streaming upload already refuses beyond this; re-checked here because
        # `_bytes` only knows the 25 MiB ceiling that applies to uploaded originals.
        if len(data) > MAX_ASSET_BYTES:
            raise ResourceError("ASSET_TOO_LARGE", 413)
        media_type = recognize_image(data)
        self._sync(self._path(key).parent)
        return AssetBytes(
            media_type,
            len(data),
            hashlib.sha256(data).hexdigest(),
            key,
            f"objects/{uuid4().hex}",
        )

    def read(self, key: str, size: int, digest: str) -> bytes:
        data = self._bytes(key)
        if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
            raise ResourceError("FILE_CORRUPTED", 409)
        return data

    def exists(self, key: str) -> bool:
        # A missing managed area is equivalent to a missing file, but unsafe paths
        # must not be treated as absence and trigger destructive repair.
        area = key.split("/", 1)[0]
        if KEY.fullmatch(key) and not (self.root / area).exists():
            if (self.root / area).is_symlink() or self.root.resolve() != self.root:
                raise ResourceError("STORAGE_PATH_UNAVAILABLE", 503)
            return False
        path = self._path(key)
        if path.is_symlink():
            raise ResourceError("STORAGE_PATH_UNAVAILABLE", 503)
        return path.exists()

    def promote(self, source: str, destination: str, size: int, digest: str) -> None:
        self.read(source, size, digest)
        target = self._path(destination, create=True)
        if target.exists() or target.is_symlink():
            self.read(destination, size, digest)
            return
        origin = self._path(source)
        try:
            os.replace(origin, target)
            self._sync(target.parent)
            if origin.parent != target.parent:
                self._sync(origin.parent)
        except OSError:
            raise ResourceError("STORAGE_PATH_UNAVAILABLE", 503) from None

    def discard(self, key: str) -> None:
        if not self.exists(key):
            return
        path = self._path(key)
        try:
            # No recursive deletion, unrecognized filenames or symlink traversal.
            if not stat.S_ISREG(path.lstat().st_mode):
                raise OSError
            path.unlink()
            self._sync(path.parent)
        except OSError:
            raise ResourceError("STORAGE_PATH_UNAVAILABLE", 503) from None

    def quarantine(self, key: str) -> None:
        if not self.exists(key):
            return
        target = self._path(trash_key(key), create=True)
        if target.exists() or target.is_symlink():
            return
        try:
            origin = self._path(key)
            os.replace(origin, target)
            # Start the orphan grace period at isolation, not the original upload.
            os.utime(target, None, follow_symlinks=False)
            self._sync(target.parent)
            self._sync(origin.parent)
        except OSError:
            raise ResourceError("STORAGE_PATH_UNAVAILABLE", 503) from None

    def orphans(self, before: datetime) -> list[str]:
        candidates = []
        for area in ("staging", "objects", "trash"):
            if not (self.root / area).exists():
                continue
            directory = self._directory(area)
            for path in directory.iterdir():
                key = f"{area}/{path.name}"
                info = path.lstat()
                if (
                    KEY.fullmatch(key)
                    and stat.S_ISREG(info.st_mode)
                    and info.st_mtime <= before.timestamp()
                ):
                    candidates.append(key)
        return candidates
