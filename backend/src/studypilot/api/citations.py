"""Citation endpoints for a resource, behind the existing local-access gate.

Same three-operation shape as the frozen-content snapshot: read it, write the
whole thing (201 first, 200 on replacement, with a version precondition), or
delete it with a strong version header.
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

from studypilot.application import citations
from studypilot.modules.citations.contracts import CitationError, CitationPut

router = APIRouter(prefix="/api/v1/resources/{resource_id}/citation", redirect_slashes=False)
MESSAGES = {
    "RESOURCE_NOT_FOUND": "没有找到这份资料。",
    "CITATION_NOT_FOUND": "这份资料还没有填写文献信息。",
    "VERSION_REQUIRED": "请先读取文献信息的当前版本。",
    "VERSION_CONFLICT": "文献信息已发生变化。请重新读取后核对。",
    "VALIDATION_ERROR": "输入不符合要求。请检查文献字段与版本。",
    "MALFORMED_REQUEST": "请求内容无法解析。",
    "CONTENT_TYPE_UNSUPPORTED": "当前操作只接受 application/json。",
    "UNKNOWN_ERROR": "文献信息操作未完成。请使用请求编号排查。",
}


def failure(request: Request, error: CitationError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status,
        content={
            "error": {
                "code": error.code,
                # An unmapped code must not escape as a bare 500 without the
                # error envelope: a KeyError here would be raised inside the
                # handler that is supposed to be producing this response.
                "message": MESSAGES.get(error.code, MESSAGES["UNKNOWN_ERROR"]),
                "details": error.details,
                "request_id": request.state.request_id,
            }
        },
    )


def guarded(request: Request, build: Callable[[], Response]) -> Response:
    try:
        return build()
    except CitationError as error:
        return failure(request, error)
    except Exception:
        # Never let DB parameters, request bodies or paths reach an error or a log.
        return failure(request, CitationError("UNKNOWN_ERROR", 500))


# Contract 10: instants go out as RFC 3339 UTC ending in `Z`. `jsonable_encoder`
# would render an aware UTC datetime as `+00:00`, which is the same instant but
# not the spelling the contract promises - notes, highlights and learning all
# normalise it the same way, and a client that validates the format (the reader
# does) rejects the odd one out.
def encoded(payload: Any) -> Any:
    return jsonable_encoder(
        payload,
        custom_encoder={
            datetime: lambda value: value.astimezone(UTC).isoformat().replace("+00:00", "Z")
        },
    )


def respond(request: Request, operation: Callable[[], Any], status: int = 200) -> Response:
    def build() -> Response:
        result = operation()
        return (
            Response(status_code=204)
            if result is None
            else JSONResponse(status_code=status, content=encoded(result))
        )

    return guarded(request, build)


def identity(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise CitationError("RESOURCE_NOT_FOUND", 404) from None


def reject_constant(value: str) -> None:
    raise ValueError(value)


async def command_body(request: Request) -> CitationPut:
    if (
        request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        != "application/json"
    ):
        raise CitationError("CONTENT_TYPE_UNSUPPORTED", 415)
    try:
        raw = await request.body()
        json.loads(raw, parse_constant=reject_constant)
    except (ValueError, RecursionError):
        raise CitationError("MALFORMED_REQUEST", 400) from None
    try:
        return CitationPut.model_validate_json(raw)
    except ValidationError:
        raise CitationError("VALIDATION_ERROR", 422) from None


def version_header(request: Request) -> int:
    entries = request.headers.getlist("if-match")
    if len(entries) != 1 or not re.fullmatch(r'"[1-9][0-9]*"', entries[0]):
        raise CitationError("VERSION_REQUIRED", 428)
    try:
        # The pattern allows any length; int() refuses beyond 4300 digits, and an
        # unusable version is a precondition failure, not a server fault.
        return int(entries[0][1:-1])
    except ValueError:
        raise CitationError("VERSION_REQUIRED", 428) from None


@router.get("")
def get_citation(request: Request, resource_id: str) -> Response:
    return respond(request, lambda: citations.detail(identity(resource_id)))


@router.put("")
async def put_citation(request: Request, resource_id: str) -> Response:
    try:
        record_id = identity(resource_id)
        command = await command_body(request)
    except CitationError as error:
        return failure(request, error)

    def build() -> Response:
        payload, created = citations.put(record_id, command)
        # 201 the first time a resource gets a citation, 200 when replacing it.
        return JSONResponse(status_code=201 if created else 200, content=encoded(payload))

    return await run_in_threadpool(lambda: guarded(request, build))


@router.delete("")
def delete_citation(request: Request, resource_id: str) -> Response:
    return respond(
        request,
        lambda: citations.remove(identity(resource_id), version_header(request)),
        204,
    )
