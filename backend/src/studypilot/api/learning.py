"""HTTP adapter for the three approved learning operations."""

import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from studypilot.application import learning
from studypilot.modules.learning.contracts import (
    GlobalRecordQuery,
    LearningError,
    RecordQuery,
    StudyRecordCreate,
)

router = APIRouter(prefix="/api/v1", redirect_slashes=False)
MESSAGES = {
    "RESOURCE_NOT_FOUND": "没有找到这份资料。",
    "VERSION_CONFLICT": "学习进度已发生变化。请刷新后再记录。",
    "STATE_CONFLICT": "当前进度或复习安排不满足此操作条件。请刷新并检查输入。",
    "INVALID_STATE_TRANSITION": "不能这样切换学习状态。请检查当前状态。",
    "VALIDATION_ERROR": "输入不符合要求。请检查字段或查询条件。",
    "MALFORMED_REQUEST": "请求内容无法解析。",
    "CONTENT_TYPE_UNSUPPORTED": "当前操作只接受 application/json。",
    "UNKNOWN_ERROR": "学习操作未完成。请使用请求编号排查。",
}


def failure(request: Request, error: LearningError) -> JSONResponse:
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


def respond(
    request: Request, operation: Callable[[], dict[str, Any]], status: int = 200
) -> JSONResponse:
    try:
        return JSONResponse(
            status_code=status,
            content=jsonable_encoder(
                operation(),
                custom_encoder={
                    datetime: lambda value: value.astimezone(UTC).isoformat().replace("+00:00", "Z")
                },
            ),
        )
    except LearningError as error:
        return failure(request, error)
    except Exception:
        return failure(request, LearningError("UNKNOWN_ERROR", 500))


def identity(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise LearningError("RESOURCE_NOT_FOUND", 404) from None


def reject_constant(value: str) -> None:
    raise ValueError("invalid JSON constant")


@router.post("/resources/{resource_id}/study-records")
async def create_record(request: Request, resource_id: str) -> JSONResponse:
    try:
        record_id = identity(resource_id)
        if (
            request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            != "application/json"
        ):
            raise LearningError("CONTENT_TYPE_UNSUPPORTED", 415)
        try:
            raw = await request.body()
            json.loads(raw, parse_constant=reject_constant)
        except (ValueError, RecursionError):
            raise LearningError("MALFORMED_REQUEST", 400) from None
        try:
            command = StudyRecordCreate.model_validate_json(raw)
        except ValidationError:
            raise LearningError("VALIDATION_ERROR", 422) from None
    except LearningError as error:
        return failure(request, error)
    return await run_in_threadpool(
        respond, request, lambda: learning.create(record_id, command), 201
    )


def list_operation(request: Request, resource_id: str | None = None) -> dict[str, Any]:
    record_id = identity(resource_id) if resource_id is not None else None
    if any(len(request.query_params.getlist(key)) != 1 for key in request.query_params):
        raise LearningError("VALIDATION_ERROR", 422)
    model = RecordQuery if record_id is not None else GlobalRecordQuery
    try:
        query = model.model_validate(dict(request.query_params))
    except ValidationError:
        raise LearningError("VALIDATION_ERROR", 422) from None
    return learning.page(query, record_id)


@router.get("/resources/{resource_id}/study-records")
def resource_records(request: Request, resource_id: str) -> JSONResponse:
    return respond(request, lambda: list_operation(request, resource_id))


@router.get("/study-records")
def global_records(request: Request) -> JSONResponse:
    return respond(request, lambda: list_operation(request))
