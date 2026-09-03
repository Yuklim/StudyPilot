"""Bounded streaming multipart. Never use the OS default upload temp directory."""

import hashlib
import json
import os
from typing import Any, BinaryIO

from fastapi import Request
from pydantic import ValidationError
from python_multipart import MultipartParser
from python_multipart.multipart import parse_options_header
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect

from studypilot.application.files import FileService
from studypilot.modules.resources.contracts import FileCreate, ResourceError
from studypilot.modules.resources.files import MAX_FILE_BYTES


class Upload:
    def __init__(self, service: FileService, boundary: bytes) -> None:
        self.service = service
        self.key = ""
        self.stream: BinaryIO | None = None
        self.name = ""
        self.declared = ""
        self.field = ""
        self.headers: dict[bytes, bytes] = {}
        self.header_name = bytearray()
        self.header_value = bytearray()
        self.header_size = 0
        self.value = bytearray()
        self.fields: dict[str, Any] = {}
        self.parts = 0
        self.size = 0
        self.digest = hashlib.sha256()
        self.total = 0
        self.is_file = False
        self.ended = False
        self.parser = MultipartParser(
            boundary,
            callbacks={
                "on_part_begin": self.part_begin,
                "on_header_field": self.header_field,
                "on_header_value": self.header_data,
                "on_header_end": self.header_end,
                "on_headers_finished": self.headers_finished,
                "on_part_data": self.part_data,
                "on_part_end": self.part_end,
                "on_end": self.end,
            },
        )

    def part_begin(self) -> None:
        self.parts += 1
        if self.parts > 27:
            raise ResourceError("VALIDATION_ERROR", 422)
        self.headers = {}
        self.header_size = 0
        self.value = bytearray()
        self.is_file = False

    def header_field(self, data: bytes, start: int, end: int) -> None:
        self._header_limit(end - start)
        self.header_name.extend(data[start:end])

    def header_data(self, data: bytes, start: int, end: int) -> None:
        self._header_limit(end - start)
        self.header_value.extend(data[start:end])

    def _header_limit(self, size: int) -> None:
        self.header_size += size
        if self.header_size > 4096:
            raise ResourceError("MALFORMED_REQUEST", 400)

    def header_end(self) -> None:
        name = bytes(self.header_name).lower()
        if name in self.headers:
            raise ResourceError("MALFORMED_REQUEST", 400)
        self.headers[name] = bytes(self.header_value)
        self.header_name.clear()
        self.header_value.clear()

    def headers_finished(self) -> None:
        disposition, options = parse_options_header(self.headers.get(b"content-disposition", b""))
        if disposition != b"form-data" or b"name" not in options:
            raise ResourceError("MALFORMED_REQUEST", 400)
        self.field = options[b"name"].decode("utf-8")
        self.is_file = b"filename" in options
        if self.is_file:
            if self.field != "file" or self.key:
                raise ResourceError("VALIDATION_ERROR", 422)
            self.name = options[b"filename"].decode("utf-8")
            self.declared = self.headers.get(b"content-type", b"").decode("ascii")
            self.key, self.stream = self.service.begin()
        elif self.field not in {
            "source_type",
            "title",
            "source_name",
            "save_reason",
            "topic_id",
            "tag_ids",
        }:
            raise ResourceError("VALIDATION_ERROR", 422)

    def part_data(self, data: bytes, start: int, end: int) -> None:
        if self.is_file:
            self.size += end - start
            if self.size > MAX_FILE_BYTES:
                raise ResourceError("FILE_TOO_LARGE", 413)
            assert self.stream is not None
            self.stream.write(data[start:end])
            self.digest.update(data[start:end])
        else:
            if len(self.value) + end - start > 4096:
                raise ResourceError("VALIDATION_ERROR", 422)
            self.value.extend(data[start:end])

    def part_end(self) -> None:
        if self.is_file:
            assert self.stream is not None
            if self.size == 0:
                raise ResourceError("VALIDATION_ERROR", 422)
            self.stream.flush()
            os.fsync(self.stream.fileno())
            self.stream.close()
            self.stream = None
        else:
            value = self.value.decode("utf-8")
            if self.field == "tag_ids":
                self.fields.setdefault("tag_ids", []).append(value)
            elif self.field in self.fields:
                raise ResourceError("VALIDATION_ERROR", 422)
            else:
                self.fields[self.field] = value

    def end(self) -> None:
        self.ended = True

    def feed(self, data: bytes) -> None:
        self.total += len(data)
        if self.total > MAX_FILE_BYTES + 65536:
            raise ResourceError("FILE_TOO_LARGE", 413)
        self.parser.write(data)

    def finish(self) -> dict[str, Any]:
        self.parser.finalize()
        if not self.ended:
            raise ResourceError("MALFORMED_REQUEST", 400)
        if not self.key:
            raise ResourceError("VALIDATION_ERROR", 422)
        try:
            command = FileCreate.model_validate_json(json.dumps(self.fields))
        except ValidationError:
            raise ResourceError("VALIDATION_ERROR", 422) from None
        return self.service.create(
            command, self.key, self.name, self.declared, self.digest.hexdigest()
        )

    def close(self) -> None:
        if self.stream:
            self.stream.close()
        if self.key:
            self.service.release(self.key)


async def create_file(request: Request) -> dict[str, Any]:
    _, options = parse_options_header(request.headers.get("content-type", ""))
    boundary = options.get(b"boundary", b"")
    if not boundary or len(boundary) > 200 or any(c < 33 or c > 126 for c in boundary):
        raise ResourceError("MALFORMED_REQUEST", 400)
    upload = Upload(request.app.state.files, boundary)
    try:
        async for chunk in request.stream():
            await run_in_threadpool(upload.feed, chunk)
        return await run_in_threadpool(upload.finish)
    except (ValueError, ClientDisconnect):
        raise ResourceError("MALFORMED_REQUEST", 400) from None
    except OSError:
        raise ResourceError("STORAGE_PATH_UNAVAILABLE", 503) from None
    finally:
        await run_in_threadpool(upload.close)
