"""Frozen-content endpoints for a resource, behind the existing local-access gate."""

import json
import re
from collections.abc import Callable
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse, Response

from studypilot.application import snapshots
from studypilot.modules.resources.contracts import ResourceError
from studypilot.modules.resources.snapshots import SnapshotPut

router = APIRouter(prefix="/api/v1/resources/{resource_id}/snapshot", redirect_slashes=False)
MESSAGES = {
    "RESOURCE_NOT_FOUND": "没有找到这份资料。",
    "SNAPSHOT_NOT_FOUND": "这份资料还没有保存正文快照。",
    "VERSION_REQUIRED": "请先读取快照的当前版本。",
    "VERSION_CONFLICT": "快照已发生变化。请重新读取后核对内容。",
    "VALIDATION_ERROR": "输入不符合要求。请检查正文内容与版本。",
    "MALFORMED_REQUEST": "请求内容无法解析。",
    "CONTENT_TYPE_UNSUPPORTED": "当前操作只接受 application/json。",
    "UNKNOWN_ERROR": "快照操作未完成。请使用请求编号排查。",
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
                "message": MESSAGES[error.code],
                "details": details,
                "request_id": request.state.request_id,
            }
        },
    )


def guarded(request: Request, build: Callable[[], Response]) -> Response:
    try:
        return build()
    except ResourceError as error:
        return failure(request, error)
    except Exception:
        # Never let DB parameters, request bodies or paths reach an error or a log.
        return failure(request, ResourceError("UNKNOWN_ERROR", 500))


def respond(request: Request, operation: Callable[[], Any], status: int = 200) -> Response:
    def build() -> Response:
        result = operation()
        return (
            Response(status_code=204)
            if result is None
            else JSONResponse(status_code=status, content=jsonable_encoder(result))
        )

    return guarded(request, build)


def identity(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise ResourceError("RESOURCE_NOT_FOUND", 404) from None


def reject_constant(value: str) -> None:
    raise ValueError(value)


async def command_body(request: Request) -> SnapshotPut:
    if (
        request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        != "application/json"
    ):
        raise ResourceError("CONTENT_TYPE_UNSUPPORTED", 415)
    try:
        raw = await request.body()
        json.loads(raw, parse_constant=reject_constant)
    except (ValueError, RecursionError):
        raise ResourceError("MALFORMED_REQUEST", 400) from None
    try:
        return SnapshotPut.model_validate_json(raw)
    except ValidationError:
        raise ResourceError("VALIDATION_ERROR", 422) from None


def version_header(request: Request) -> int:
    entries = request.headers.getlist("if-match")
    if len(entries) != 1 or not re.fullmatch(r'"[1-9][0-9]*"', entries[0]):
        raise ResourceError("VERSION_REQUIRED", 428)
    try:
        # The pattern allows any length; int() refuses beyond 4300 digits, and an
        # unusable version is a precondition failure, not a server fault.
        return int(entries[0][1:-1])
    except ValueError:
        raise ResourceError("VERSION_REQUIRED", 428) from None


@router.get("")
def get_snapshot(request: Request, resource_id: str) -> Response:
    return respond(request, lambda: snapshots.detail(identity(resource_id)))


@router.put("")
async def put_snapshot(request: Request, resource_id: str) -> Response:
    try:
        record_id = identity(resource_id)
        command = await command_body(request)
    except ResourceError as error:
        return failure(request, error)

    def build() -> Response:
        payload, created = snapshots.put(record_id, command)
        # 201 the first time a resource gets frozen text, 200 when replacing it.
        return JSONResponse(status_code=201 if created else 200, content=jsonable_encoder(payload))

    return await run_in_threadpool(lambda: guarded(request, build))


@router.delete("")
def delete_snapshot(request: Request, resource_id: str) -> Response:
    return respond(
        request,
        lambda: snapshots.remove(identity(resource_id), version_header(request)),
        204,
    )
