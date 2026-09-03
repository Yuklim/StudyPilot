"""Synthetic taxonomy lifecycle, rollback and boundary checks in temporary SQLite."""

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.orm.exc import StaleDataError
from starlette.requests import Request
from support import RuntimePaths

from studypilot.infrastructure.database.models import Tag
from studypilot.infrastructure.database.taxonomy_store import MODELS, TaxonomyStore
from studypilot.main import create_app
from studypilot.modules.taxonomy.contracts import Kind

CONTEXT = {"sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty"}
FULLWIDTH_PYTHON = "\uff30\uff59\uff54\uff48\uff4f\uff4e"


@pytest.fixture
def authorized(client: TestClient) -> TestClient:
    token = client.get("/api/v1/local-session", headers=CONTEXT).json()["data"]["token"]
    client.headers.update(
        {**CONTEXT, "Origin": "http://127.0.0.1:5173", "X-StudyPilot-Token": token}
    )
    return client


def check_error(
    response: Any, status: int, code: str, details: dict[str, int] | None = None
) -> None:
    assert response.status_code == status, response.text
    body = response.json()["error"]
    assert set(body) == {"code", "message", "details", "request_id"}
    assert body["code"] == code and body["details"] == (details or {})
    assert body["request_id"] == response.headers["x-request-id"]
    assert response.headers["cache-control"] == "no-store"


def create(client: TestClient, kind: str, **body: Any) -> dict[str, Any]:
    response = client.post(f"/api/v1/{kind}s", json={"name": "合成分类"} | body)
    assert response.status_code == 201, response.text
    return dict(response.json()["data"])


@pytest.mark.usefixtures("database")
@pytest.mark.parametrize("kind", ["topic", "tag"])
def test_lifecycle_projection_versions_and_restart(authorized: TestClient, kind: str) -> None:
    record = create(authorized, kind, name=f"  {FULLWIDTH_PYTHON}  ")
    path = f"/api/v1/{kind}s/{record['id']}"
    assert record["name"] == FULLWIDTH_PYTHON and record["version"] == 1
    assert UUID(record["id"]).version == 4
    assert set(record) == {"id", "name", "version", "created_at", "updated_at"} | (
        {"description"} if kind == "topic" else set()
    )
    assert datetime.fromisoformat(record["created_at"]).tzinfo == UTC
    check_error(
        authorized.post(f"/api/v1/{kind}s", json={"name": "python"}),
        409,
        f"DUPLICATE_{kind.upper()}",
    )
    assert authorized.get(path).json()["data"] == record
    noop = authorized.patch(path, json={"expected_version": 1, "name": f" {FULLWIDTH_PYTHON} "})
    assert noop.json()["data"] == record
    changed = authorized.patch(path, json={"expected_version": 1, "name": "新分类"}).json()["data"]
    assert changed["version"] == 2 and changed["created_at"] == record["created_at"]
    check_error(
        authorized.patch(path, json={"expected_version": 1, "name": "旧页面"}),
        409,
        "VERSION_CONFLICT",
        {"current_version": 2},
    )
    check_error(
        authorized.delete(path, headers={"If-Match": '"1"'}),
        409,
        "VERSION_CONFLICT",
        {"current_version": 2},
    )
    with TestClient(create_app(), base_url="http://127.0.0.1:8000") as restarted:
        token = restarted.get("/api/v1/local-session", headers=CONTEXT).json()["data"]["token"]
        assert restarted.get(path, headers={"X-StudyPilot-Token": token}).json()["data"] == changed
    deleted = authorized.delete(path, headers={"If-Match": '"2"'})
    assert deleted.status_code == 204 and deleted.content == b""
    check_error(authorized.get(path), 404, f"{kind.upper()}_NOT_FOUND")
    check_error(
        authorized.delete(path, headers={"If-Match": '"2"'}), 404, f"{kind.upper()}_NOT_FOUND"
    )


@pytest.mark.usefixtures("database")
def test_topic_patch_clear_omitted_fields_and_duplicate_rollback(authorized: TestClient) -> None:
    record = create(authorized, "topic", name="甲", description="合成私密描述")
    create(authorized, "topic", name="乙")
    path = f"/api/v1/topics/{record['id']}"
    updated = authorized.patch(path, json={"expected_version": 1, "description": None}).json()[
        "data"
    ]
    assert updated["description"] is None and updated["name"] == "甲" and updated["version"] == 2
    check_error(
        authorized.patch(
            path, json={"expected_version": 2, "name": "乙", "description": "should rollback"}
        ),
        409,
        "DUPLICATE_TOPIC",
    )
    assert authorized.get(path).json()["data"] == updated


@pytest.mark.parametrize("kind,limit", [("topic", 80), ("tag", 50)])
@pytest.mark.parametrize(
    "body",
    [
        {},
        {"name": None},
        {"name": 123},
        {"name": "   "},
        {"name": "x", "color": "red"},
        {"name": "x", "id": "unexpected"},
    ],
)
def test_invalid_create_before_database(
    authorized: TestClient, runtime: RuntimePaths, kind: str, limit: int, body: dict[str, Any]
) -> None:
    check_error(authorized.post(f"/api/v1/{kind}s", json=body), 422, "VALIDATION_ERROR")
    check_error(
        authorized.post(f"/api/v1/{kind}s", json={"name": "x" * (limit + 1)}),
        422,
        "VALIDATION_ERROR",
    )
    assert not runtime.database.exists()


@pytest.mark.parametrize("kind", ["topic", "tag"])
def test_version_and_json_validation_before_database(
    authorized: TestClient, runtime: RuntimePaths, kind: str
) -> None:
    path = f"/api/v1/{kind}s/{uuid4()}"
    check_error(authorized.patch(path, json={"name": "修改"}), 428, "VERSION_REQUIRED")
    for body in [
        {"expected_version": 1},
        {"expected_version": True, "name": "x"},
        {"expected_version": "1", "name": "x"},
        {"expected_version": 0, "name": "x"},
        {"expected_version": None, "name": "x"},
        {"expected_version": 1, "name": None},
        {"expected_version": 1, "unknown": "private"},
    ]:
        check_error(authorized.patch(path, json=body), 422, "VALIDATION_ERROR")
    for value in [None, "", "1", 'W/"1"', '"0"', '"01"', '"1", "2"', "*"]:
        check_error(
            authorized.delete(path, headers={} if value is None else {"If-Match": value}),
            428,
            "VERSION_REQUIRED",
        )
    for raw in ["", "{", '{"name":NaN}', '{"name":Infinity}', "\x00"]:
        check_error(
            authorized.post(
                f"/api/v1/{kind}s", content=raw, headers={"Content-Type": "application/json"}
            ),
            400,
            "MALFORMED_REQUEST",
        )
    check_error(authorized.post(f"/api/v1/{kind}s", json=[]), 422, "VALIDATION_ERROR")
    check_error(
        authorized.post(f"/api/v1/{kind}s", content="name=private"), 415, "CONTENT_TYPE_UNSUPPORTED"
    )
    check_error(authorized.get(f"/api/v1/{kind}s/invalid-id"), 404, f"{kind.upper()}_NOT_FOUND")
    assert not runtime.database.exists()


@pytest.mark.parametrize("kind,limit", [("topic", 80), ("tag", 50)])
def test_invalid_queries_before_database(
    authorized: TestClient, runtime: RuntimePaths, kind: str, limit: int
) -> None:
    for query in [
        "page=0",
        "page=-1",
        "page=1.5",
        "page_size=101",
        "q=",
        "q=%20%20",
        "sort=description",
        "unknown=x",
        "page=1&page=2",
        "q=" + "x" * (limit + 1),
    ]:
        check_error(authorized.get(f"/api/v1/{kind}s?{query}"), 422, "VALIDATION_ERROR")
    assert not runtime.database.exists()


@pytest.mark.usefixtures("database")
@pytest.mark.parametrize("kind", ["topic", "tag"])
def test_name_search_sort_and_pagination(authorized: TestClient, kind: str) -> None:
    rows = [create(authorized, kind, name=name) for name in ["\uff23afe  学习", "B", "A", "a  b"]]
    matched = authorized.get(f"/api/v1/{kind}s", params={"q": "cAFE　学习"}).json()
    assert matched["data"] == [rows[0]]
    if kind == "topic":
        create(authorized, kind, name="不匹配", description="只在描述中的词")
        assert authorized.get("/api/v1/topics?q=只在描述中的词").json()["data"] == []
    page = authorized.get(f"/api/v1/{kind}s?page_size=2&sort=name").json()
    assert [row["name"] for row in page["data"]] == ["A", "B"]
    assert page["page"]["has_more"] is True
    for sort in ["name", "-name", "created_at", "-created_at"]:
        result = authorized.get(
            f"/api/v1/{kind}s", params={"sort": sort, "page_size": "100"}
        ).json()["data"]
        key = sort.lstrip("-")
        assert [row[key] for row in result] == sorted(
            [row[key] for row in result], reverse=sort.startswith("-")
        )
    empty = authorized.get(f"/api/v1/{kind}s?page=9&page_size=2").json()
    assert empty["data"] == [] and empty["page"]["number"] == 9 and not empty["page"]["has_more"]


@pytest.mark.usefixtures("database")
def test_references_and_idempotent_associations_preserve_resources(authorized: TestClient) -> None:
    topic, tag = create(authorized, "topic"), create(authorized, "tag")
    response = authorized.post(
        "/api/v1/resources",
        json={
            "source_type": "PASTE",
            "title": "合成资料",
            "pasted_content": "private original",
            "topic_id": topic["id"],
            "tag_ids": [tag["id"]],
        },
    )
    assert response.status_code == 201
    resource = response.json()["data"]
    path = f"/api/v1/resources/{resource['id']}"
    for kind, item in [("topic", topic), ("tag", tag)]:
        check_error(
            authorized.delete(f"/api/v1/{kind}s/{item['id']}", headers={"If-Match": '"1"'}),
            409,
            "TAXONOMY_IN_USE",
            {"resource_count": 1},
        )
    link = f"{path}/tags/{tag['id']}"
    first = authorized.put(link).json()["data"]
    assert first["association_version"] == 1
    assert authorized.put(link).json()["data"] == first
    assert authorized.get(path).json()["data"] == resource
    assert authorized.delete(link).status_code == 204
    assert authorized.delete(link).status_code == 204
    detached = authorized.get(path).json()["data"]
    assert detached == resource | {"tags": []}
    new = authorized.put(link).json()["data"]
    assert new["created_at"] > first["created_at"]
    assert authorized.delete(link).status_code == 204
    assert (
        authorized.delete(f"/api/v1/tags/{tag['id']}", headers={"If-Match": '"1"'}).status_code
        == 204
    )
    check_error(authorized.delete(link), 404, "TAG_NOT_FOUND")
    check_error(
        authorized.put(f"/api/v1/resources/{uuid4()}/tags/{tag['id']}"), 404, "RESOURCE_NOT_FOUND"
    )
    assert authorized.get(path).json()["data"]["topic_id"] == topic["id"]


@pytest.mark.usefixtures("database")
@pytest.mark.parametrize("kind", ["topic", "tag"])
def test_commit_failure_is_sanitized_and_rolls_back(
    authorized: TestClient, session_factory: sessionmaker[Session], kind: Kind
) -> None:
    def reject(session: Session) -> None:
        raise RuntimeError("synthetic private SQL/path/body")

    event.listen(Session, "before_commit", reject)
    try:
        response = authorized.post(f"/api/v1/{kind}s", json={"name": "rollback"})
        check_error(response, 500, "UNKNOWN_ERROR")
        assert "synthetic" not in response.text and "rollback" not in response.text
    finally:
        event.remove(Session, "before_commit", reject)
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(MODELS[kind])) == 0


@pytest.mark.usefixtures("database")
def test_database_uniqueness_race_is_classified_without_driver_text(
    authorized: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    create(authorized, "tag", name="exists")
    original = TaxonomyStore.unique
    calls = 0

    def miss_first(
        self: TaxonomyStore, kind: Kind, name: str, identity: UUID | None = None
    ) -> None:
        nonlocal calls
        calls += 1
        if calls > 1:
            original(self, kind, name, identity)

    monkeypatch.setattr(TaxonomyStore, "unique", miss_first)
    check_error(authorized.post("/api/v1/tags", json={"name": "EXISTS"}), 409, "DUPLICATE_TAG")
    assert calls == 2


@pytest.mark.usefixtures("database")
def test_orm_stale_update_rechecks_current_version(
    authorized: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    item = create(authorized, "tag")
    path = f"/api/v1/tags/{item['id']}"
    assert authorized.patch(path, json={"expected_version": 1, "name": "new"}).status_code == 200

    def stale(*args: Any) -> None:
        raise StaleDataError("synthetic private SQL")

    monkeypatch.setattr(TaxonomyStore, "update", stale)
    check_error(
        authorized.patch(path, json={"expected_version": 1, "name": "old"}),
        409,
        "VERSION_CONFLICT",
        {"current_version": 2},
    )
    assert authorized.get(path).json()["data"]["name"] == "new"


def test_missing_database_has_controlled_error(authorized: TestClient) -> None:
    check_error(authorized.get("/api/v1/topics"), 500, "UNKNOWN_ERROR")


@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/topics"),
        ("PATCH", "/tags/id"),
        ("DELETE", "/topics/id"),
        ("PUT", "/resources/id/tags/id"),
        ("DELETE", "/resources/id/tags/id"),
    ],
)
def test_unauthorized_never_reads_body_or_database(
    client: TestClient,
    runtime: RuntimePaths,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
    path: str,
) -> None:
    async def forbidden_read(self: Request) -> bytes:
        raise AssertionError("body must not be read")

    monkeypatch.setattr(Request, "body", forbidden_read)
    check_error(
        client.request(
            method, "/api/v1" + path, content="synthetic", headers={"Content-Type": "text/plain"}
        ),
        403,
        "LOCAL_TOKEN_REQUIRED",
    )
    assert not runtime.database.exists()


@pytest.mark.usefixtures("database")
def test_concurrent_duplicate_creates_preserve_one_row(
    authorized: TestClient, session_factory: sessionmaker[Session]
) -> None:
    def attempt() -> int:
        return authorized.post("/api/v1/tags", json={"name": "race"}).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = list(executor.map(lambda _: attempt(), range(2)))
    # SQLite lock contention may return a controlled 500; never silently replay.
    assert statuses.count(201) == 1 and all(code in {201, 409, 500} for code in statuses)
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Tag)) == 1


@pytest.mark.usefixtures("database")
@pytest.mark.parametrize("operation", ["update", "delete", "attach", "detach"])
def test_write_commit_failure_preserves_all_existing_state(
    authorized: TestClient, operation: str
) -> None:
    topic = create(authorized, "topic")
    tag = create(authorized, "tag", name="used")
    unused = create(authorized, "tag", name="unused")
    resource = authorized.post(
        "/api/v1/resources",
        json={
            "source_type": "PASTE",
            "title": "rollback resource",
            "pasted_content": "synthetic original",
            "topic_id": topic["id"],
            "tag_ids": [tag["id"]],
        },
    ).json()["data"]
    resource_path = f"/api/v1/resources/{resource['id']}"
    topic_path = f"/api/v1/topics/{topic['id']}"
    unused_path = f"/api/v1/tags/{unused['id']}"
    actions: dict[str, tuple[str, str, dict[str, Any]]] = {
        "update": (
            "PATCH",
            topic_path,
            {"json": {"expected_version": 1, "description": "not committed"}},
        ),
        "delete": ("DELETE", unused_path, {"headers": {"If-Match": '"1"'}}),
        "attach": ("PUT", f"{resource_path}/tags/{unused['id']}", {}),
        "detach": ("DELETE", f"{resource_path}/tags/{tag['id']}", {}),
    }

    def reject(session: Session) -> None:
        raise RuntimeError("synthetic private rollback detail")

    event.listen(Session, "before_commit", reject)
    try:
        method, path, kwargs = actions[operation]
        check_error(authorized.request(method, path, **kwargs), 500, "UNKNOWN_ERROR")
    finally:
        event.remove(Session, "before_commit", reject)
    assert authorized.get(resource_path).json()["data"] == resource
    assert authorized.get(topic_path).json()["data"] == topic
    assert authorized.get(unused_path).json()["data"] == unused


def test_description_and_duplicate_version_headers_rejected_before_database(
    authorized: TestClient, runtime: RuntimePaths
) -> None:
    for description in ["x" * 501, 42]:
        check_error(
            authorized.post("/api/v1/topics", json={"name": "x", "description": description}),
            422,
            "VALIDATION_ERROR",
        )
    check_error(
        authorized.post("/api/v1/tags", json={"name": "x", "description": None}),
        422,
        "VALIDATION_ERROR",
    )
    check_error(
        authorized.delete(
            f"/api/v1/topics/{uuid4()}", headers=[("If-Match", '"1"'), ("If-Match", '"1"')]
        ),
        428,
        "VERSION_REQUIRED",
    )
    assert not runtime.database.exists()


def test_delivery_catalog_matches_taxonomy_routes_and_preserves_resource_limits() -> None:
    document = json.loads(
        (Path(__file__).resolve().parents[2] / "docs/contracts/openapi-v1.json").read_text()
    )
    profile = document["x-delivery-profile"]
    expected = {
        "listTopics",
        "createTopic",
        "getTopic",
        "updateTopic",
        "deleteTopic",
        "listTags",
        "createTag",
        "getTag",
        "updateTag",
        "deleteTag",
        "attachResourceTag",
        "detachResourceTag",
    }
    available = set(profile["available_operations"])
    assert expected <= available
    assert len(available) == 20 and "downloadOriginalFile" in available
    assert {
        "listResourceStudyRecords",
        "createResourceStudyRecord",
        "listStudyRecords",
    } <= available
    assert profile["available_operations"]["createResource"]["source_types"] == [
        "WEB",
        "PASTE",
        "FILE",
    ]
    assert profile["available_operations"]["createResource"]["request_media_types"] == [
        "application/json",
        "multipart/form-data",
    ]
    assert profile["deferred_inputs"] == []
    operations = {
        value["operationId"]
        for entry in document["paths"].values()
        if isinstance(entry, dict)
        for value in entry.values()
        if isinstance(value, dict) and "operationId" in value
    }
    assert available <= operations
