"""Five approved note endpoints, behind the existing local-access middleware."""

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

from studypilot.application import notes
from studypilot.modules.notes.contracts import NoteCreate, NoteError, NotePatch, NoteQuery

router = APIRouter(prefix="/api/v1/resources/{resource_id}/notes", redirect_slashes=False)
MESSAGES = {
    "RESOURCE_NOT_FOUND": "没有找到这份资料。",
    "NOTE_NOT_FOUND": "没有找到这条笔记。",
    "VERSION_REQUIRED": "请先读取笔记的当前版本。",
    "VERSION_CONFLICT": "笔记已发生变化。请刷新后核对内容。",
    "VALIDATION_ERROR": "输入不符合要求。请检查笔记内容、版本或查询条件。",
    "MALFORMED_REQUEST": "请求内容无法解析。",
    "CONTENT_TYPE_UNSUPPORTED": "当前操作只接受 application/json。",
    "UNKNOWN_ERROR": "笔记操作未完成。请使用请求编号排查。",
}


def failure(request: Request, error: NoteError) -> JSONResponse:
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
    except NoteError as error:
        return failure(request, error)
    except Exception:
        return failure(request, NoteError("UNKNOWN_ERROR", 500))


def identity(value: str, kind: str) -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise NoteError(f"{kind.upper()}_NOT_FOUND", 404) from None


def reject_constant(value: str) -> None:
    raise ValueError("invalid JSON constant")


async def command_body(request: Request, *, patch: bool) -> NoteCreate | NotePatch:
    if (
        request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        != "application/json"
    ):
        raise NoteError("CONTENT_TYPE_UNSUPPORTED", 415)
    try:
        raw = await request.body()
        value = json.loads(raw, parse_constant=reject_constant)
    except (ValueError, RecursionError):
        raise NoteError("MALFORMED_REQUEST", 400) from None
    if patch and isinstance(value, dict) and "expected_version" not in value:
        raise NoteError("VERSION_REQUIRED", 428)
    try:
        return (NotePatch if patch else NoteCreate).model_validate_json(raw)
    except ValidationError:
        raise NoteError("VALIDATION_ERROR", 422) from None


def version_header(request: Request) -> int:
    values = request.headers.getlist("if-match")
    if len(values) != 1 or not re.fullmatch(r'"[1-9][0-9]*"', values[0]):
        raise NoteError("VERSION_REQUIRED", 428)
    try:
        return int(values[0][1:-1])
    except ValueError:
        raise NoteError("VERSION_REQUIRED", 428) from None


@router.get("")
def list_notes(request: Request, resource_id: str) -> Response:
    def operation() -> dict[str, Any]:
        rid = identity(resource_id, "resource")
        if any(len(request.query_params.getlist(key)) != 1 for key in request.query_params):
            raise NoteError("VALIDATION_ERROR", 422)
        try:
            query = NoteQuery.model_validate(dict(request.query_params))
        except ValidationError:
            raise NoteError("VALIDATION_ERROR", 422) from None
        return notes.page(rid, query)

    return respond(request, operation)


@router.post("")
async def create_note(request: Request, resource_id: str) -> Response:
    try:
        rid = identity(resource_id, "resource")
        command = await command_body(request, patch=False)
    except NoteError as error:
        return failure(request, error)
    return await run_in_threadpool(respond, request, lambda: notes.create(rid, command), 201)


@router.get("/{note_id}")
def get_note(request: Request, resource_id: str, note_id: str) -> Response:
    return respond(
        request, lambda: notes.detail(identity(resource_id, "resource"), identity(note_id, "note"))
    )


@router.patch("/{note_id}")
async def update_note(request: Request, resource_id: str, note_id: str) -> Response:
    try:
        rid, nid = identity(resource_id, "resource"), identity(note_id, "note")
        command = await command_body(request, patch=True)
    except NoteError as error:
        return failure(request, error)
    assert isinstance(command, NotePatch)
    return await run_in_threadpool(respond, request, lambda: notes.update(rid, nid, command))


@router.delete("/{note_id}")
def delete_note(request: Request, resource_id: str, note_id: str) -> Response:
    return respond(
        request,
        lambda: notes.delete(
            identity(resource_id, "resource"), identity(note_id, "note"), version_header(request)
        ),
        204,
    )
