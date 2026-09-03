"""Conservative recognition, not content extraction or malware scanning.

Complex containers run in a short-lived, time/CPU-bounded process.
No filename, file body, parser exception or parser log is returned.
"""

import io
import logging
import subprocess
import sys
import zipfile
from pathlib import PurePosixPath
from unicodedata import category

from studypilot.modules.resources.contracts import ResourceError

MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".md": "text/markdown; charset=utf-8",
    ".markdown": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
}


def safe_name(value: str) -> str:
    value = value.replace("\\", "/").rsplit("/", 1)[-1]
    value = "".join(c for c in value if not category(c).startswith("C")).strip()
    if not value or len(value) > 255:
        raise ResourceError("VALIDATION_ERROR", 422)
    return value


def recognize(data: bytes, name: str, declared_type: str) -> str:
    suffix = PurePosixPath(name.lower()).suffix
    expected = MEDIA_TYPES.get(suffix)
    # Multiple ordinary title dots are fine; recognized/executable inner suffixes
    # are ambiguous disguises (e.g. notes.pdf.txt or invoice.exe.pdf).
    inner = PurePosixPath(name.lower()).suffixes[:-1]
    dangerous = set(MEDIA_TYPES) | {".exe", ".com", ".bat", ".cmd", ".js", ".html", ".zip"}
    declared = declared_type.split(";", 1)[0].strip().lower()
    if (
        expected is None
        or any(item in dangerous for item in inner)
        or declared not in {"", "application/octet-stream", expected.split(";", 1)[0]}
    ):
        raise ResourceError("FILE_TYPE_UNSUPPORTED", 415)
    if suffix in {".md", ".markdown", ".txt"}:
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            raise ResourceError("FILE_TYPE_UNSUPPORTED", 415) from None
        if "\x00" in text:
            raise ResourceError("FILE_TYPE_UNSUPPORTED", 415)
    else:
        try:
            result = subprocess.run(
                [sys.executable, "-m", __name__, suffix],
                input=data,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=6,
                check=False,
            )
        except subprocess.TimeoutExpired:
            raise ResourceError("FILE_TYPE_UNSUPPORTED", 415) from None
        if result.returncode != 0:
            if result.returncode == 2:
                raise ResourceError("UNKNOWN_ERROR", 500)
            raise ResourceError("FILE_TYPE_UNSUPPORTED", 415)
    return expected


def validate_container(data: bytes, suffix: str) -> None:
    if suffix == ".pdf":
        from pypdf import PdfReader

        if not data.startswith(b"%PDF-"):
            raise ValueError
        reader = PdfReader(io.BytesIO(data), strict=True)
        root = reader.root_object
        if root.get("/Type") != "/Catalog" or "/Pages" not in root:
            raise ValueError
    elif suffix == ".doc":
        import olefile  # type: ignore[import-untyped]

        if not data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
            raise ValueError
        with olefile.OleFileIO(io.BytesIO(data), raise_defects=olefile.DEFECT_INCORRECT) as ole:
            if not ole.exists("WordDocument"):
                raise ValueError
            # Force validation of the word stream's sector chain, not just its name.
            ole.openstream("WordDocument").read()
    elif suffix == ".docx":
        from defusedxml.ElementTree import fromstring  # type: ignore[import-untyped]

        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            infos = archive.infolist()
            names = [item.filename for item in infos]
            if (
                len(names) != len(set(names))
                or "[Content_Types].xml" not in names
                or "word/document.xml" not in names
            ):
                raise ValueError
            # Bound decompression work. Never extract entries onto the filesystem.
            if sum(item.file_size for item in infos) > 128 * 1024 * 1024:
                raise ValueError
            for item in infos:
                path = PurePosixPath(item.filename)
                if (
                    path.is_absolute()
                    or ".." in path.parts
                    or "\\" in item.filename
                    or ":" in item.filename
                    or item.flag_bits & 1
                    or (item.external_attr >> 16) & 0o170000 == 0o120000
                ):
                    raise ValueError
                # Stream through CRC checks without keeping all expanded entries.
                with archive.open(item) as stream:
                    while stream.read(65536):
                        pass
            types = fromstring(archive.read("[Content_Types].xml"))
            document = fromstring(archive.read("word/document.xml"))
            if types.tag != "{http://schemas.openxmlformats.org/package/2006/content-types}Types":
                raise ValueError
            if document.tag not in {
                "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}document",
                "{http://purl.oclc.org/ooxml/wordprocessingml/main}document",
            }:
                raise ValueError
    else:
        raise ValueError


def main() -> int:
    logging.disable(logging.CRITICAL)
    try:
        import resource

        resource.setrlimit(resource.RLIMIT_CPU, (4, 4))
        # macOS rejects RLIMIT_AS reductions. Do not reject every valid document
        # on that platform or claim an unavailable OS memory limit.
        if sys.platform.startswith("linux"):
            resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
    except Exception:
        return 2
    try:
        from studypilot.modules.resources.files import MAX_FILE_BYTES

        data = sys.stdin.buffer.read(MAX_FILE_BYTES + 1)
        if not data or len(data) > MAX_FILE_BYTES:
            return 1
        validate_container(data, sys.argv[1])
        return 0
    except Exception:
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
