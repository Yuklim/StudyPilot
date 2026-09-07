"""Frozen images for a snapshot, behind the existing local-access gate.

The byte endpoint cannot be used as an `<img src>`: the gate requires
`sec-fetch-dest: empty` and the process token, and a browser's image request
carries neither. A caller that already holds the token fetches the bytes and
hands the blob to the element. That is the gate working, not a defect — the
alternatives were widening it to accept image requests, or putting the token in
the URL where it would reach history, referrers and logs.
"""

import hashlib
import json
import os
from collections.abc import Callable
from typing import Any, BinaryIO
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from python_multipart import MultipartParser
from python_multipart.multipart import parse_options_header
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect
from starlette.responses import JSONResponse, Response

from studypilot.api.snapshots import identity, version_header
from studypilot.application.snapshot_assets import AssetService
from studypilot.modules.resources.assets import MAX_ASSET_BYTES, AssetUpload
from studypilot.modules.resources.contracts import ResourceError

router = APIRouter(prefix="/api/v1/resources/{resource_id}/snapshot/assets", redirect_slashes=False)


MESSAGES = {
    "RESOURCE_NOT_FOUND": "没有找到这份资料。",
    "SNAPSHOT_NOT_FOUND": "这份资料还没有保存正文快照。",
    "SNAPSHOT_ASSET_NOT_FOUND": "没有找到这张已冻结的图片。",
    "ASSET_TYPE_UNSUPPORTED": "只接受 PNG、JPEG、GIF 或 WebP 图片。",
    "ASSET_TOO_LARGE": "单张图片不能超过 10 MiB。",
    "VERSION_REQUIRED": "请先读取快照的当前版本。",
    "VERSION_CONFLICT": "快照已发生变化。请重新读取后核对内容。",
    "VALIDATION_ERROR": "输入不符合要求。请检查图片与来源地址。",
    "MALFORMED_REQUEST": "请求内容无法解析。",
    "FILE_CORRUPTED": "这张图片的内容已损坏。无法返回。",
    "STORAGE_PATH_UNAVAILABLE": "本机存储暂时不可用。",
    "UNKNOWN_ERROR": "图片操作未完成。请使用请求编号排查。",
}


def failure(request: Request, error: ResourceError) -> JSONResponse:
    details: dict[str, Any] = error.details or {}
    if error.code == "VERSION_CONFLICT" and error.current_version is not None:
        details = {"current_version": error.current_version}
    return JSONResponse(
        status_code=error.status,
        content={
            "error": {
                "code": error.code,
                # An unmapped code must not become a 500 on the way out.
                "message": MESSAGES.get(error.code, MESSAGES["UNKNOWN_ERROR"]),
                "details": details,
                "request_id": request.state.request_id,
            }
        },
    )


def service(request: Request) -> AssetService:
    assets: AssetService = request.app.state.assets
    return assets


def guarded(request: Request, build: Callable[[], Response]) -> Response:
    try:
        return build()
    except ResourceError as error:
        return failure(request, error)
    except Exception:
        # Never let DB parameters, request bodies or paths reach an error or a log.
        return failure(request, ResourceError("UNKNOWN_ERROR", 500))


class AssetUploadReader:
    """One image and one `source_url`, bounded at every step.

    Modelled on the original-file upload, with the parts it does not need removed:
    no filename is kept (an asset has no user-facing name) and no declared content
    type is consulted (only the bytes decide the format).
    """

    def __init__(self, assets: AssetService, boundary: bytes) -> None:
        self.assets = assets
        self.key = ""
        self.stream: BinaryIO | None = None
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
        if self.parts > 4:
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
            self.key, self.stream = self.assets.files.begin()
        elif self.field != "source_url":
            raise ResourceError("VALIDATION_ERROR", 422)

    def part_data(self, data: bytes, start: int, end: int) -> None:
        if self.is_file:
            self.size += end - start
            if self.size > MAX_ASSET_BYTES:
                # Refuse mid-stream: the rest is never read, hashed or written.
                raise ResourceError("ASSET_TOO_LARGE", 413)
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
        elif self.field in self.fields:
            raise ResourceError("VALIDATION_ERROR", 422)
        else:
            self.fields[self.field] = self.value.decode("utf-8")

    def end(self) -> None:
        self.ended = True

    def feed(self, data: bytes) -> None:
        self.total += len(data)
        if self.total > MAX_ASSET_BYTES + 65536:
            raise ResourceError("ASSET_TOO_LARGE", 413)
        self.parser.write(data)

    def finish(self, resource_id: UUID, expected: int) -> dict[str, Any]:
        self.parser.finalize()
        if not self.ended:
            raise ResourceError("MALFORMED_REQUEST", 400)
        if not self.key:
            raise ResourceError("VALIDATION_ERROR", 422)
        try:
            command = AssetUpload.model_validate_json(json.dumps(self.fields))
        except ValidationError:
            raise ResourceError("VALIDATION_ERROR", 422) from None
        return self.assets.create(resource_id, command, self.key, self.digest.hexdigest(), expected)

    def close(self) -> None:
        if self.stream:
            self.stream.close()
        if self.key:
            self.assets.files.release(self.key)


@router.post("")
async def upload_asset(request: Request, resource_id: str) -> Response:
    try:
        record_id = identity(resource_id)
        expected = version_header(request)
        assets = service(request)
        # Establish the snapshot and its version before consuming the body, so a
        # refused precondition writes nothing at all.
        await run_in_threadpool(assets.precondition, record_id, expected)
        _, options = parse_options_header(request.headers.get("content-type", ""))
        boundary = options.get(b"boundary", b"")
        if not boundary or len(boundary) > 200 or any(c < 33 or c > 126 for c in boundary):
            raise ResourceError("MALFORMED_REQUEST", 400)
    except ResourceError as error:
        return failure(request, error)

    reader = AssetUploadReader(assets, boundary)
    try:
        try:
            async for chunk in request.stream():
                await run_in_threadpool(reader.feed, chunk)
            payload = await run_in_threadpool(reader.finish, record_id, expected)
        except (ValueError, ClientDisconnect):
            raise ResourceError("MALFORMED_REQUEST", 400) from None
        except OSError:
            raise ResourceError("STORAGE_PATH_UNAVAILABLE", 503) from None
        return JSONResponse(status_code=201, content={"data": jsonable_encoder(payload)})
    except ResourceError as error:
        return failure(request, error)
    except Exception:
        return failure(request, ResourceError("UNKNOWN_ERROR", 500))
    finally:
        await run_in_threadpool(reader.close)


@router.get("")
def list_assets(request: Request, resource_id: str) -> Response:
    def build() -> Response:
        record_id = identity(resource_id)
        return JSONResponse(content={"data": jsonable_encoder(service(request).listing(record_id))})

    return guarded(request, build)


@router.get("/{asset_id}/bytes")
def download_asset(request: Request, resource_id: str, asset_id: str) -> Response:
    def build() -> Response:
        row, data = service(request).download(identity(resource_id), asset_identity(asset_id))
        return Response(
            content=data,
            headers={
                # The recognized type, never what the uploader declared.
                "Content-Type": row.media_type,
                "Content-Disposition": 'attachment; filename="snapshot-asset"',
                "X-Content-Type-Options": "nosniff",
                "Cache-Control": "private, no-store",
            },
        )

    return guarded(request, build)


@router.delete("/{asset_id}")
def delete_asset(request: Request, resource_id: str, asset_id: str) -> Response:
    def build() -> Response:
        service(request).remove(
            identity(resource_id), asset_identity(asset_id), version_header(request)
        )
        return Response(status_code=204)

    return guarded(request, build)


def asset_identity(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise ResourceError("SNAPSHOT_ASSET_NOT_FOUND", 404) from None
