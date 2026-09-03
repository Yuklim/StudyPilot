"""HTTP adapter for the twelve approved taxonomy operations."""

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

from studypilot.application import taxonomy
from studypilot.modules.taxonomy.contracts import (
    Kind,
    TagCreate,
    TagPatch,
    TaxonomyError,
    TaxonomyQuery,
    TopicCreate,
    TopicPatch,
)

MESSAGES = {
    "TOPIC_NOT_FOUND": "没有找到这个主题。",
    "TAG_NOT_FOUND": "没有找到这个标签。",
    "RESOURCE_NOT_FOUND": "没有找到这份资料。",
    "DUPLICATE_TOPIC": "已存在同名主题。",
    "DUPLICATE_TAG": "已存在同名标签。",
    "TAXONOMY_IN_USE": "该分类仍被资料使用。不能删除。",
    "VERSION_REQUIRED": "请先读取当前版本再执行此操作。",
    "VERSION_CONFLICT": "数据已发生变化。请刷新后重试。",
    "VALIDATION_ERROR": "输入不符合要求。请检查字段或查询条件。",
    "MALFORMED_REQUEST": "请求内容无法解析。",
    "CONTENT_TYPE_UNSUPPORTED": "当前操作只接受 application/json。",
    "UNKNOWN_ERROR": "分类操作未完成。请使用请求编号排查。",
}


def failure(request: Request, error: TaxonomyError) -> JSONResponse:
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
        return (
            Response(status_code=204)
            if status == 204
            else JSONResponse(status_code=status, content=jsonable_encoder(result))
        )
    except TaxonomyError as error:
        return failure(request, error)
    except Exception:
        return failure(request, TaxonomyError("UNKNOWN_ERROR", 500))


def identity(value: str, kind: str) -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise TaxonomyError(f"{kind.upper()}_NOT_FOUND", 404) from None


def reject_constant(value: str) -> None:
    raise ValueError("invalid JSON constant")


async def command_body(
    request: Request, kind: Kind, *, patch: bool
) -> TopicCreate | TagCreate | TopicPatch | TagPatch:
    if (
        request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        != "application/json"
    ):
        raise TaxonomyError("CONTENT_TYPE_UNSUPPORTED", 415)
    try:
        raw = await request.body()
        value = json.loads(raw, parse_constant=reject_constant)
    except (ValueError, RecursionError):
        raise TaxonomyError("MALFORMED_REQUEST", 400) from None
    if patch and isinstance(value, dict) and "expected_version" not in value:
        raise TaxonomyError("VERSION_REQUIRED", 428)
    model = (
        (TopicPatch if kind == "topic" else TagPatch)
        if patch
        else (TopicCreate if kind == "topic" else TagCreate)
    )
    try:
        return model.model_validate_json(raw)
    except ValidationError:
        raise TaxonomyError("VALIDATION_ERROR", 422) from None


def version_header(request: Request) -> int:
    entries = request.headers.getlist("if-match")
    if len(entries) != 1 or not re.fullmatch(r'"[1-9][0-9]*"', entries[0]):
        raise TaxonomyError("VERSION_REQUIRED", 428)
    try:
        return int(entries[0][1:-1])
    except ValueError:
        raise TaxonomyError("VERSION_REQUIRED", 428) from None


def classification_router(kind: Kind) -> APIRouter:
    routes = APIRouter(prefix=f"/api/v1/{kind}s", redirect_slashes=False)

    @routes.get("")
    def list_items(request: Request) -> Response:
        def operation() -> dict[str, Any]:
            if any(len(request.query_params.getlist(key)) != 1 for key in request.query_params):
                raise TaxonomyError("VALIDATION_ERROR", 422)
            try:
                query = TaxonomyQuery.model_validate(dict(request.query_params))
            except ValidationError:
                raise TaxonomyError("VALIDATION_ERROR", 422) from None
            if kind == "tag" and query.q is not None and len(query.q) > 50:
                raise TaxonomyError("VALIDATION_ERROR", 422)
            return taxonomy.page(kind, query)

        return respond(request, operation)

    @routes.post("")
    async def create_item(request: Request) -> Response:
        try:
            command = await command_body(request, kind, patch=False)
        except TaxonomyError as error:
            return failure(request, error)
        assert isinstance(command, (TopicCreate, TagCreate))
        return await run_in_threadpool(
            respond, request, lambda: taxonomy.create(kind, command), 201
        )

    @routes.get("/{taxonomy_id}")
    def get_item(request: Request, taxonomy_id: str) -> Response:
        return respond(request, lambda: taxonomy.detail(kind, identity(taxonomy_id, kind)))

    @routes.patch("/{taxonomy_id}")
    async def update_item(request: Request, taxonomy_id: str) -> Response:
        try:
            record_id = identity(taxonomy_id, kind)
            command = await command_body(request, kind, patch=True)
        except TaxonomyError as error:
            return failure(request, error)
        assert isinstance(command, (TopicPatch, TagPatch))
        return await run_in_threadpool(
            respond, request, lambda: taxonomy.update(kind, record_id, command)
        )

    @routes.delete("/{taxonomy_id}")
    def delete_item(request: Request, taxonomy_id: str) -> Response:
        return respond(
            request,
            lambda: taxonomy.delete(kind, identity(taxonomy_id, kind), version_header(request)),
            204,
        )

    return routes


router = APIRouter(redirect_slashes=False)
router.include_router(classification_router("topic"))
router.include_router(classification_router("tag"))


@router.put("/api/v1/resources/{resource_id}/tags/{tag_id}")
def attach_tag(request: Request, resource_id: str, tag_id: str) -> Response:
    return respond(
        request, lambda: taxonomy.attach(identity(resource_id, "resource"), identity(tag_id, "tag"))
    )


@router.delete("/api/v1/resources/{resource_id}/tags/{tag_id}")
def detach_tag(request: Request, resource_id: str, tag_id: str) -> Response:
    return respond(
        request,
        lambda: taxonomy.detach(identity(resource_id, "resource"), identity(tag_id, "tag")),
        204,
    )
