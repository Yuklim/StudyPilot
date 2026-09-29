"""Reading-highlight endpoints, behind the existing local-access middleware.

Same shape as the personal-note endpoints: ids in the path, versioned writes,
`If-Match` on delete, and every failure mapped to one of the contract's codes.
"""

import json
import re
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse, Response

from studypilot.application import highlights
from studypilot.modules.highlights.contracts import (
    HighlightCreate,
    HighlightError,
    HighlightPatch,
    HighlightQuery,
)

router = APIRouter(prefix="/api/v1/resources/{resource_id}/highlights", redirect_slashes=False)
MESSAGES = {
    "RESOURCE_NOT_FOUND": "没有找到这份资料。",
    "SNAPSHOT_NOT_FOUND": "这份资料还没有保存正文快照。",
    "PDF_NOT_FOUND": "这份资料没有可标注的 PDF 原件。",
    "HIGHLIGHT_NOT_FOUND": "没有找到这条高亮。",
    "NOTE_NOT_FOUND": "没有找到这条笔记。",
    "NOTE_ALREADY_HIGHLIGHTED": "这条心得已经配给另一段高亮了。",
    "VERSION_REQUIRED": "请先读取高亮的当前版本。",
    "VERSION_CONFLICT": "高亮已发生变化。请刷新后核对。",
    "VALIDATION_ERROR": "输入不符合要求。请检查高亮内容、版本或查询条件。",
    "MALFORMED_REQUEST": "请求内容无法解析。",
    "CONTENT_TYPE_UNSUPPORTED": "当前操作只接受 application/json。",
    "UNKNOWN_ERROR": "高亮操作未完成。请使用请求编号排查。",
}


def failure(request: Request, error: HighlightError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status,
        content={
            "error": {
                "code": error.code,
                "message": MESSAGES[error.code],
                "details": error.details,
                "request_id": request.state.request_id,
            }
        },
    )


def respond(request: Request, operation: Callable[[], Any], status: int = 200) -> Response:
    try:
        result = operation()
        if status == 204:
            return Response(status_code=204)
        return JSONResponse(
            status_code=status,
            content=jsonable_encoder(
                result,
                custom_encoder={
                    datetime: lambda value: value.astimezone(UTC).isoformat().replace("+00:00", "Z")
                },
            ),
        )
    except HighlightError as error:
        return failure(request, error)
    except Exception:
        return failure(request, HighlightError("UNKNOWN_ERROR", 500))


def identity(value: str, kind: str) -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise HighlightError(f"{kind.upper()}_NOT_FOUND", 404) from None


def reject_constant(value: str) -> None:
    raise ValueError("invalid JSON constant")


def require_json(request: Request) -> None:
    if (
        request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        != "application/json"
    ):
        raise HighlightError("CONTENT_TYPE_UNSUPPORTED", 415)


async def command_body(request: Request, *, patch: bool) -> HighlightCreate | HighlightPatch:
    require_json(request)
    try:
        raw = await request.body()
        value = json.loads(raw, parse_constant=reject_constant)
    except (ValueError, RecursionError):
        raise HighlightError("MALFORMED_REQUEST", 400) from None
    if patch and isinstance(value, dict) and "expected_version" not in value:
        raise HighlightError("VERSION_REQUIRED", 428)
    try:
        return (HighlightPatch if patch else HighlightCreate).model_validate_json(raw)
    except ValidationError:
        raise HighlightError("VALIDATION_ERROR", 422) from None


def version_header(request: Request) -> int:
    values = request.headers.getlist("if-match")
    if len(values) != 1 or not re.fullmatch(r'"[1-9][0-9]*"', values[0]):
        raise HighlightError("VERSION_REQUIRED", 428)
    return int(values[0][1:-1])


@router.get("")
def list_highlights(request: Request, resource_id: str) -> Response:
    def operation() -> dict[str, Any]:
        rid = identity(resource_id, "resource")
        if any(len(request.query_params.getlist(key)) != 1 for key in request.query_params):
            raise HighlightError("VALIDATION_ERROR", 422)
        try:
            query = HighlightQuery.model_validate(dict(request.query_params))
        except ValidationError:
            raise HighlightError("VALIDATION_ERROR", 422) from None
        return highlights.page(rid, query)

    return respond(request, operation)


@router.post("")
async def create_highlight(request: Request, resource_id: str) -> Response:
    try:
        rid = identity(resource_id, "resource")
        command = await command_body(request, patch=False)
    except HighlightError as error:
        return failure(request, error)
    assert isinstance(command, HighlightCreate)
    return await run_in_threadpool(respond, request, lambda: highlights.create(rid, command), 201)


@router.get("/{highlight_id}")
def get_highlight(request: Request, resource_id: str, highlight_id: str) -> Response:
    return respond(
        request,
        lambda: highlights.detail(
            identity(resource_id, "resource"), identity(highlight_id, "highlight")
        ),
    )


@router.patch("/{highlight_id}")
async def update_highlight(request: Request, resource_id: str, highlight_id: str) -> Response:
    """Note binding, style and colour can move (only the fields named); the anchor is fixed."""
    try:
        rid = identity(resource_id, "resource")
        hid = identity(highlight_id, "highlight")
        command = await command_body(request, patch=True)
    except HighlightError as error:
        return failure(request, error)
    assert isinstance(command, HighlightPatch)
    return await run_in_threadpool(respond, request, lambda: highlights.update(rid, hid, command))


@router.delete("/{highlight_id}")
def delete_highlight(request: Request, resource_id: str, highlight_id: str) -> Response:
    return respond(
        request,
        lambda: highlights.delete(
            identity(resource_id, "resource"),
            identity(highlight_id, "highlight"),
            version_header(request),
        ),
        204,
    )
