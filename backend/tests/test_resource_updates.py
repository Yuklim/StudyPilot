"""Resource edits against isolated HTTP/SQLite, including lost races and rollback."""

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.orm import Session, sessionmaker
from starlette.requests import Request
from support import RuntimePaths

from studypilot.infrastructure.database.models import (
    LearningProgress,
    LearningResource,
    OriginalFile,
)
from studypilot.infrastructure.database.resource_store import ResourceStore
from studypilot.main import create_app
from studypilot.modules.resources.contracts import ResourcePatch

CONTEXT = {"sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty"}
PRIVATE = "synthetic-private-source"


def authorize(client: TestClient) -> TestClient:
    token = client.get("/api/v1/local-session", headers=CONTEXT).json()["data"]["token"]
    client.headers.update(
        {**CONTEXT, "Origin": "http://127.0.0.1:5173", "X-StudyPilot-Token": token}
    )
    return client


@pytest.fixture
def authorized(client: TestClient) -> TestClient:
    return authorize(client)


def create(client: TestClient, source: str = "WEB") -> dict[str, Any]:
    if source == "FILE":
        response = client.post(
            "/api/v1/resources",
            data={"source_type": "FILE", "title": "合成文件"},
            files={"file": ("synthetic.txt", b"synthetic original", "text/plain")},
        )
    else:
        response = client.post(
            "/api/v1/resources",
            json={"title": "原始标题", "source_type": source}
            | (
                {"source_url": "https://example.test/original"}
                if source == "WEB"
                else {"pasted_content": PRIVATE}
            ),
        )
    assert response.status_code == 201, response.text
    return dict(response.json()["data"])


@pytest.fixture
def item(database: Any, authorized: TestClient) -> dict[str, Any]:
    return create(authorized)


def url(item: dict[str, Any]) -> str:
    return "/api/v1/resources/" + str(item["id"])


def error(response: Any, status: int, code: str, version: int | None = None) -> None:
    assert response.status_code == status, response.text
    value = response.json()["error"]
    assert set(value) == {"code", "message", "details", "request_id"}
    assert value["code"] == code
    assert value["details"] == ({} if version is None else {"current_version": version})
    assert value["request_id"] == response.headers["x-request-id"]
    assert response.headers["cache-control"] == "no-store"
    for secret in (PRIVATE, "SQL", "Traceback", "/private/", "synthetic original"):
        assert secret not in response.text


@pytest.mark.parametrize("source", ["WEB", "PASTE", "FILE"])
def test_update_preserves_other_data_noop_and_restart(
    authorized: TestClient,
    database: Any,
    source: str,
) -> None:
    item = create(authorized, source)
    path = url(item)
    tag = authorized.post("/api/v1/tags", json={"name": "保留标签"}).json()["data"]
    assert authorized.put(path + "/tags/" + tag["id"]).status_code == 200
    assert authorized.post(path + "/notes", json={"content": "保留心得"}).status_code == 201
    assert (
        authorized.post(
            path + "/study-records",
            json={
                "expected_progress_version": 1,
                "started_at": "2026-09-02T10:00:00Z",
                "duration_seconds": 90,
                "progress_before": 0,
                "progress_after": 10,
                "status_before": "UNREAD",
                "status_after": "IN_PROGRESS",
                "summary": "旧记录",
            },
        ).status_code
        == 201
    )
    before = authorized.get(path).json()["data"]
    notes = authorized.get(path + "/notes").json()
    history = authorized.get(path + "/study-records").json()
    patch: dict[str, Any] = {
        "title": "  新标题😀  ",
        "source_name": "新来源",
        "save_reason": "方便再找回",
    }
    if source == "WEB":
        patch["source_url"] = "https://example.test/new?query=kept"
    if source == "PASTE":
        patch["pasted_content"] = "  \n<script>synthetic</script>\n\t原文保留  "
    changed = authorized.patch(path, json={"expected_version": 1} | patch)
    assert changed.status_code == 200, changed.text
    current = changed.json()["data"]
    for key, value in patch.items():
        assert current[key] == (value.strip() if key == "title" else value)
    assert current["version"] == 2 and current["updated_at"] > before["updated_at"]
    assert current["created_at"] == before["created_at"]
    for key in ("id", "source_type", "progress", "tags", "review_plan", "original_file"):
        assert current[key] == before[key]
    assert authorized.get(path + "/notes").json() == notes
    assert authorized.get(path + "/study-records").json() == history
    assert authorized.patch(path, json={"expected_version": 2} | patch).json()["data"] == current
    error(authorized.patch(path, json={"expected_version": 1} | patch), 409, "VERSION_CONFLICT", 2)
    for field in ("source_name", "save_reason"):
        cleared = authorized.patch(path, json={"expected_version": current["version"], field: None})
        assert cleared.status_code == 200
        current = cleared.json()["data"]
        assert current[field] is None
    if source == "FILE":
        original = current["original_file"]
        downloaded = authorized.get("/api/v1/files/" + original["id"] + "/download")
        assert downloaded.content == b"synthetic original"
        assert authorized.get(path).json()["data"] == current
    with TestClient(create_app(), base_url="http://127.0.0.1:8000") as restarted:
        authorize(restarted)
        assert restarted.get(path).json()["data"] == current


def test_reassign_and_clear_topic_updates_filters_search_and_reference_protection(
    authorized: TestClient,
    item: dict[str, Any],
) -> None:
    topics = [
        authorized.post("/api/v1/topics", json={"name": name}).json()["data"]
        for name in ("旧主题", "新主题")
    ]
    path = url(item)
    for version, topic in enumerate(topics, 1):
        response = authorized.patch(
            path,
            json={
                "expected_version": version,
                "topic_id": topic["id"],
                "title": " \uff21\uff22\uff23   Python ",
                "source_name": "教材来源",
                "save_reason": "复查原因",
            },
        )
        assert response.status_code == 200 and response.json()["data"]["topic_id"] == topic["id"]
    assert (
        authorized.get("/api/v1/resources", params={"topic_id": topics[0]["id"]}).json()["data"]
        == []
    )
    page = authorized.get("/api/v1/resources", params={"topic_id": topics[1]["id"]}).json()
    assert [row["id"] for row in page["data"]] == [item["id"]]
    for query in ("abc python", "教材", "复查"):
        assert (
            authorized.get("/api/v1/resources", params={"q": query}).json()["page"]["total_items"]
            == 1
        )
    assert (
        authorized.delete(
            "/api/v1/topics/" + topics[0]["id"], headers={"If-Match": '"1"'}
        ).status_code
        == 204
    )
    held = authorized.delete("/api/v1/topics/" + topics[1]["id"], headers={"If-Match": '"1"'})
    assert held.status_code == 409 and held.json()["error"]["code"] == "TAXONOMY_IN_USE"
    before = authorized.get(path).json()
    error(
        authorized.patch(
            path, json={"expected_version": 3, "title": "不能部分保存", "topic_id": str(uuid4())}
        ),
        404,
        "TOPIC_NOT_FOUND",
    )
    assert authorized.get(path).json() == before
    assert authorized.patch(path, json={"expected_version": 3, "topic_id": None}).status_code == 200
    assert (
        authorized.get("/api/v1/resources", params={"topic_unassigned": "true"}).json()["page"][
            "total_items"
        ]
        == 1
    )
    assert (
        authorized.delete(
            "/api/v1/topics/" + topics[1]["id"], headers={"If-Match": '"1"'}
        ).status_code
        == 204
    )


@pytest.mark.parametrize(
    "changes",
    [
        {},
        {"expected_version": True, "title": "x"},
        {"expected_version": "1", "title": "x"},
        {"expected_version": 0, "title": "x"},
        {"expected_version": 1.5, "title": "x"},
        {"expected_version": None, "title": "x"},
        {"title": None},
        {"title": " \t\n"},
        {"title": "x" * 201},
        {"title": 5},
        {"source_name": "x" * 121},
        {"save_reason": "x" * 1001},
        {"topic_id": "bad"},
        {"source_name": 3},
        {"source_type": "FILE"},
        {"version": 8},
        {"tag_ids": []},
        {"progress": {}},
        {"original_file": {}},
        {"unknown": PRIVATE},
        {"source_url": None},
        {"pasted_content": None},
        {"pasted_content": ""},
        {"pasted_content": "x" * 1_000_001},
        {"source_url": "https://example.test", "pasted_content": "x"},
        *[
            {"source_url": value}
            for value in (
                "javascript:alert(1)",
                "https://user:pass@example.test",
                "https://example.test/#private",
                "https:///",
                "https://example.test:bad",
                "https://[broken",
                "https://example.test\n/path",
                "https://example.test/" + "x" * 2048,
            )
        ],
    ],
)
def test_invalid_patch_before_database(
    authorized: TestClient,
    runtime: RuntimePaths,
    changes: dict[str, Any],
) -> None:
    error(
        authorized.patch(url({"id": str(uuid4())}), json={"expected_version": 1} | changes),
        422,
        "VALIDATION_ERROR",
    )
    assert not runtime.database.exists()


def test_media_json_version_security_before_body_and_database(
    authorized: TestClient,
    runtime: RuntimePaths,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = url({"id": str(uuid4())})
    for raw in (b"{", b"", b'{"expected_version":NaN}', b'{"expected_version":Infinity}'):
        error(
            authorized.patch(path, content=raw, headers={"Content-Type": "application/json"}),
            400,
            "MALFORMED_REQUEST",
        )
    invalid_bodies: list[Any] = [[], None, "invalid"]
    for body in invalid_bodies:
        error(
            authorized.patch(
                path, content=json.dumps(body), headers={"Content-Type": "application/json"}
            ),
            422,
            "VALIDATION_ERROR",
        )
    error(authorized.patch(path, json={"title": "x"}), 428, "VERSION_REQUIRED")
    for media in ("text/plain", "multipart/form-data", "application/x-www-form-urlencoded"):
        error(
            authorized.patch(path, content=PRIVATE, headers={"Content-Type": media}),
            415,
            "CONTENT_TYPE_UNSUPPORTED",
        )
    reads = 0

    async def forbidden_body(self: Request) -> bytes:
        nonlocal reads
        reads += 1
        raise AssertionError("must not read")

    monkeypatch.setattr(Request, "body", forbidden_body)
    for headers in ({"Origin": "https://evil.test"}, {"sec-fetch-site": "cross-site"}):
        error(
            authorized.patch(path, json={"expected_version": 1, "title": "x"}, headers=headers),
            403,
            "REQUEST_ORIGIN_FORBIDDEN",
        )
    del authorized.headers["X-StudyPilot-Token"]
    error(
        authorized.patch(path, json={"expected_version": 1, "title": "x"}),
        403,
        "LOCAL_TOKEN_REQUIRED",
    )
    assert reads == 0 and not runtime.database.exists()


@pytest.mark.parametrize(
    "source,field",
    [
        ("WEB", "pasted_content"),
        ("PASTE", "source_url"),
        ("FILE", "source_url"),
        ("FILE", "pasted_content"),
    ],
)
def test_source_mismatch_no_partial_update(
    authorized: TestClient, database: Any, source: str, field: str
) -> None:
    item = create(authorized, source)
    error(
        authorized.patch(
            url(item),
            json={
                "expected_version": 1,
                "title": "不要修改",
                field: "https://example.test/new" if field == "source_url" else "new text",
            },
        ),
        409,
        "SOURCE_TYPE_MISMATCH",
    )
    assert authorized.get(url(item)).json()["data"] == item


@pytest.mark.parametrize("state", ["missing", "PENDING", "FAILED", "READY"])
def test_file_visibility_and_archived_resource(
    authorized: TestClient,
    session_factory: sessionmaker[Session],
    state: str,
) -> None:
    item = create(authorized, "FILE")
    with session_factory.begin() as session:
        progress = session.scalar(
            select(LearningProgress).where(LearningProgress.resource_id == UUID(item["id"]))
        )
        assert progress is not None
        progress.status, progress.archived_from_status = "ARCHIVED", "UNREAD"
        original = session.get(OriginalFile, UUID(item["original_file"]["id"]))
        assert original is not None
        if state == "missing":
            session.delete(original)
        else:
            original.status = state
            original.failure_code = "FILE_CORRUPTED" if state == "FAILED" else None
    changed = authorized.patch(url(item), json={"expected_version": 1, "title": "归档资料仍可整理"})
    if state == "READY":
        assert (
            changed.status_code == 200
            and changed.json()["data"]["progress"]["status"] == "ARCHIVED"
        )
    else:
        error(changed, 404, "RESOURCE_NOT_FOUND")
        with session_factory() as session:
            row = session.get(LearningResource, UUID(item["id"]))
            assert row is not None and row.version == 1 and row.title == item["title"]


@pytest.mark.parametrize("stage", ["after_flush_postexec", "before_commit"])
def test_failure_rolls_back_without_replay(
    authorized: TestClient, item: dict[str, Any], stage: str
) -> None:
    calls = 0

    def fail(*args: Any) -> None:
        nonlocal calls
        calls += 1
        raise RuntimeError(PRIVATE + " SQL /private/path")

    event.listen(Session, stage, fail)
    try:
        response = authorized.patch(
            url(item), json={"expected_version": 1, "title": "rollback", "source_name": "rollback"}
        )
    finally:
        event.remove(Session, stage, fail)
    error(response, 500, "UNKNOWN_ERROR")
    assert calls == 1 and authorized.get(url(item)).json()["data"] == item


def test_actual_stale_orm_update_classified_without_replay(
    authorized: TestClient,
    item: dict[str, Any],
    session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with session_factory() as session:
        stale = session.get(LearningResource, UUID(item["id"]))
        assert stale is not None
        session.expunge(stale)
    current = authorized.patch(url(item), json={"expected_version": 1, "title": "newer"}).json()
    find = ResourceStore.find
    calls = 0

    def stale_find(self: ResourceStore, rid: UUID) -> LearningResource:
        nonlocal calls
        calls += 1
        if calls == 1:
            self._session.add(stale)
            return stale
        return find(self, rid)

    with monkeypatch.context() as patch:
        patch.setattr(ResourceStore, "find", stale_find)
        response = authorized.patch(url(item), json={"expected_version": 1, "title": "stale"})
    error(response, 409, "VERSION_CONFLICT", 2)
    assert calls == 2 and authorized.get(url(item)).json() == current


def test_real_competing_updates_one_winner(
    authorized: TestClient, item: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    barrier = Barrier(2, timeout=5)
    original = ResourceStore.check_version

    def synchronize(row: LearningResource, expected: int) -> None:
        original(row, expected)
        barrier.wait()

    def write(index: int) -> Any:
        with TestClient(create_app(), base_url="http://127.0.0.1:8000") as client:
            authorize(client)
            return client.patch(url(item), json={"expected_version": 1, "title": f"winner {index}"})

    with monkeypatch.context() as patch:
        patch.setattr(ResourceStore, "check_version", staticmethod(synchronize))
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(write, [0, 1]))
    winners = [r for r in results if r.status_code == 200]
    assert len(winners) == 1
    loser = next(r for r in results if r.status_code != 200)
    error(
        loser,
        loser.status_code,
        "VERSION_CONFLICT" if loser.status_code == 409 else "UNKNOWN_ERROR",
        2 if loser.status_code == 409 else None,
    )
    assert loser.status_code in {409, 500}
    assert winners[0].json()["data"]["version"] == 2
    assert authorized.get(url(item)).json() == winners[0].json()


def test_missing_resources_and_contract(authorized: TestClient, database: Any) -> None:
    for identity in ("invalid", str(uuid4())):
        error(
            authorized.patch(url({"id": identity}), json={"expected_version": 1, "title": "x"}),
            404,
            "RESOURCE_NOT_FOUND",
        )
    document = json.loads(
        (Path(__file__).resolve().parents[2] / "docs/contracts/openapi-v1.json").read_text()
    )
    schema = document["components"]["schemas"]["ResourcePatch"]
    assert set(ResourcePatch.model_fields) == set(schema["properties"])
    assert {
        name for name, field in ResourcePatch.model_fields.items() if field.is_required()
    } == set(schema["required"])
    assert "updateResource" in document["x-delivery-profile"]["available_operations"]
