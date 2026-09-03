"""HTTP conversion for the three authorized resource operations only."""

import json
from collections.abc import Callable
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from studypilot.application import resources
from studypilot.modules.resources.contracts import CREATE_RESOURCE, ResourceError, ResourceQuery

router = APIRouter(prefix="/api/v1/resources", redirect_slashes=False)
MESSAGES = {
    "RESOURCE_NOT_FOUND": "没有找到这份资料。",
    "TOPIC_NOT_FOUND": "所选主题不存在。",
    "TAG_NOT_FOUND": "所选标签不存在。",
    "VALIDATION_ERROR": "输入不符合要求。请检查字段、筛选条件与取值范围。",
    "MALFORMED_REQUEST": "请求内容无法解析。",
    "CONTENT_TYPE_UNSUPPORTED": "当前仅支持 application/json 网页或粘贴资料。",
    "UNKNOWN_ERROR": "资料操作未完成。请使用请求编号排查。",
}


def reject_json_constant(value: str) -> None:
    raise ValueError("non-JSON numeric constant")


def failure(request: Request, error: ResourceError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status,
        content={
            "error": {
                "code": error.code,
                "message": MESSAGES[error.code],
                "details": {},
                "request_id": request.state.request_id,
            }
        },
    )


def respond(
    request: Request, operation: Callable[[], dict[str, Any]], status: int = 200
) -> JSONResponse:
    try:
        return JSONResponse(status_code=status, content=jsonable_encoder(operation()))
    except ResourceError as error:
        return failure(request, error)
    except Exception:
        # Never let DB parameters, request bodies or paths reach an error/log.
        return failure(request, ResourceError("UNKNOWN_ERROR", 500))


@router.post("")
async def create_resource(request: Request) -> JSONResponse:
    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if media_type != "application/json":
        return failure(request, ResourceError("CONTENT_TYPE_UNSUPPORTED", 415))
    try:
        body = await request.body()
        # Pydantic's JSON parser accepts NaN/Infinity extensions; HTTP JSON does not.
        json.loads(body, parse_constant=reject_json_constant)
    except (ValueError, RecursionError):
        return failure(request, ResourceError("MALFORMED_REQUEST", 400))
    try:
        command = CREATE_RESOURCE.validate_json(body)
    except ValidationError as error:
        malformed = any(
            item["type"] == "json_invalid" for item in error.errors(include_input=False)
        )
        return failure(
            request,
            ResourceError(
                "MALFORMED_REQUEST" if malformed else "VALIDATION_ERROR", 400 if malformed else 422
            ),
        )
    return await run_in_threadpool(
        respond, request, lambda: resources.create_resource(command), 201
    )


@router.get("")
def list_resources(request: Request) -> JSONResponse:
    repeated = {"tag_id", "source_type", "learning_status"}
    values: dict[str, Any] = {}
    for key in request.query_params:
        entries = request.query_params.getlist(key)
        if key not in repeated and len(entries) != 1:
            return failure(request, ResourceError("VALIDATION_ERROR", 422))
        values[key] = entries if key in repeated else entries[0]
    try:
        query = ResourceQuery.model_validate(values)
    except ValidationError:
        return failure(request, ResourceError("VALIDATION_ERROR", 422))
    return respond(request, lambda: resources.list_resources(query))


@router.get("/{resource_id}")
def get_resource(request: Request, resource_id: str) -> JSONResponse:
    try:
        identity = UUID(resource_id)
    except ValueError:
        return failure(request, ResourceError("RESOURCE_NOT_FOUND", 404))
    return respond(request, lambda: resources.get_resource(identity))
