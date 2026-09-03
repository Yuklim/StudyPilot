"""HTTP conversion for authorized resource create/read/update operations."""

import json
from collections.abc import Callable
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from studypilot.api.file_upload import create_file
from studypilot.application import resources
from studypilot.modules.resources.contracts import (
    CREATE_RESOURCE,
    ResourceError,
    ResourcePatch,
    ResourceQuery,
)

router = APIRouter(prefix="/api/v1/resources", redirect_slashes=False)
MESSAGES = {
    "RESOURCE_NOT_FOUND": "没有找到这份资料。",
    "TOPIC_NOT_FOUND": "所选主题不存在。",
    "TAG_NOT_FOUND": "所选标签不存在。",
    "VERSION_REQUIRED": "请先读取资料的当前版本。",
    "VERSION_CONFLICT": "资料已发生变化。请重新读取后核对内容。",
    "SOURCE_TYPE_MISMATCH": "来源内容与资料类型不匹配。不能更换资料类型或文件原件。",
    "VALIDATION_ERROR": "输入不符合要求。请检查字段、筛选条件与取值范围。",
    "MALFORMED_REQUEST": "请求内容无法解析。",
    "CONTENT_TYPE_UNSUPPORTED": "请使用规定的 JSON 或文件表单格式。",
    "FILE_NOT_FOUND": "没有找到这个原始文件。",
    "FILE_TOO_LARGE": "文件不能超过 25 MiB。",
    "FILE_TYPE_UNSUPPORTED": "文件格式不受支持或内容与格式不符。",
    "FILE_STATE_UNAVAILABLE": "文件尚未保存完成或已经失效。",
    "FILE_CORRUPTED": "文件缺失或校验不符。已停止提供下载。请重新添加。",
    "STORAGE_PATH_UNAVAILABLE": "原始文件存储暂不可用。请检查本地存储配置。",
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
                "details": {"current_version": error.current_version}
                if error.code == "VERSION_CONFLICT" and error.current_version is not None
                else {},
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
    if media_type == "multipart/form-data":
        try:
            result = await create_file(request)
            return JSONResponse(status_code=201, content=jsonable_encoder(result))
        except ResourceError as error:
            if error.status == 409:
                # Integrity failure while saving is a failed server operation;
                # 409 file-state responses belong to the download contract.
                error = ResourceError("UNKNOWN_ERROR", 500)
            return failure(request, error)
        except Exception:
            return failure(request, ResourceError("UNKNOWN_ERROR", 500))
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


@router.patch("/{resource_id}")
async def update_resource(request: Request, resource_id: str) -> JSONResponse:
    if (
        request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        != "application/json"
    ):
        return failure(request, ResourceError("CONTENT_TYPE_UNSUPPORTED", 415))
    try:
        raw = await request.body()
        value = json.loads(raw, parse_constant=reject_json_constant)
    except (ValueError, RecursionError):
        return failure(request, ResourceError("MALFORMED_REQUEST", 400))
    if isinstance(value, dict) and "expected_version" not in value:
        return failure(request, ResourceError("VERSION_REQUIRED", 428))
    try:
        command = ResourcePatch.model_validate_json(raw)
    except ValidationError:
        return failure(request, ResourceError("VALIDATION_ERROR", 422))
    try:
        identity = UUID(resource_id)
    except ValueError:
        return failure(request, ResourceError("RESOURCE_NOT_FOUND", 404))
    return await run_in_threadpool(
        respond, request, lambda: resources.update_resource(identity, command)
    )
