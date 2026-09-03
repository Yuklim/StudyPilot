"""Synthetic learning lifecycle and atomic-failure checks against temporary SQLite."""

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.orm.exc import StaleDataError
from starlette.requests import Request
from support import RuntimePaths, resource

from studypilot.infrastructure.database.learning_store import LearningStore
from studypilot.infrastructure.database.models import (
    ActiveReviewPlan,
    LearningProgress,
    OriginalFile,
    StudyRecord,
)
from studypilot.main import create_app
from studypilot.modules.learning.contracts import StudyRecordCreate

CONTEXT = {"sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty"}
WHEN = "2026-09-02T10:00:00+08:00"
STATUSES = ["UNREAD", "IN_PROGRESS", "COMPLETED", "REVIEW_DUE", "ARCHIVED"]


def authorize(client: TestClient) -> TestClient:
    token = client.get("/api/v1/local-session", headers=CONTEXT).json()["data"]["token"]
    client.headers.update(
        {
            **CONTEXT,
            "Origin": "http://127.0.0.1:5173",
            "X-StudyPilot-Token": token,
        }
    )
    return client


@pytest.fixture
def authorized(client: TestClient) -> TestClient:
    return authorize(client)


@pytest.fixture
def item(database: Any, authorized: TestClient) -> dict[str, Any]:
    response = authorized.post(
        "/api/v1/resources",
        json={
            "source_type": "PASTE",
            "title": "合成学习资料",
            "pasted_content": "private synthetic source",
        },
    )
    assert response.status_code == 201
    return dict(response.json()["data"])


def record_path(item: dict[str, Any]) -> str:
    return f"/api/v1/resources/{item['id']}/study-records"


def body(item: dict[str, Any], **values: Any) -> dict[str, Any]:
    progress = item["progress"]
    return {
        "expected_progress_version": progress["version"],
        "started_at": WHEN,
        "duration_seconds": 1800,
        "progress_before": progress["progress_percent"],
        "progress_after": 30,
        "status_before": progress["status"],
        "status_after": "IN_PROGRESS",
        "summary": "合成总结",
        "questions_next": "合成疑问",
    } | values


def check_error(
    response: Any, status: int, code: str, details: dict[str, int] | None = None
) -> None:
    assert response.status_code == status, response.text
    error = response.json()["error"]
    assert set(error) == {"code", "message", "details", "request_id"}
    assert error["code"] == code and error["details"] == (details or {})
    assert error["request_id"] == response.headers["x-request-id"]
    assert response.headers["cache-control"] == "no-store"
    for secret in ("private synthetic", "合成总结", "合成疑问", "SQL", "Traceback"):
        assert secret not in response.text


def add(client: TestClient, item: dict[str, Any], **values: Any) -> dict[str, Any]:
    response = client.post(record_path(item), json=body(item, **values))
    assert response.status_code == 201, response.text
    data = dict(response.json()["data"])
    item["progress"] = data["progress"]
    return data


def test_lifecycle_atomic_history_times_and_restart(
    authorized: TestClient,
    item: dict[str, Any],
) -> None:
    original = dict(item)
    first = add(authorized, item, progress_after=100)
    progress = first["progress"]
    assert progress["status"] == "IN_PROGRESS" and progress["completed_at"] is None
    assert progress["started_at"] == first["record"]["started_at"] == "2026-09-02T02:00:00Z"
    assert progress["version"] == 2 and UUID(first["record"]["id"]).version == 4
    summary_only = add(authorized, item, progress_after=100, summary="仅补总结")
    assert summary_only["progress"] == progress
    completed = add(authorized, item, status_after="COMPLETED", progress_after=85)["progress"]
    assert completed["progress_percent"] == 85 and completed["completed_at"].endswith("Z")
    archived = add(authorized, item, status_after="ARCHIVED", progress_after=85)["progress"]
    assert archived["archived_from_status"] == "COMPLETED"
    assert archived["completed_at"] == completed["completed_at"]
    assert authorized.get("/api/v1/resources").json()["data"] == []
    assert len(authorized.get("/api/v1/resources?learning_status=ARCHIVED").json()["data"]) == 1
    restored = add(authorized, item, status_after="COMPLETED", progress_after=85)["progress"]
    assert restored["completed_at"] == completed["completed_at"]
    reopened = add(authorized, item, progress_after=80)["progress"]
    assert reopened["started_at"] == progress["started_at"] and reopened["completed_at"] is None
    unread = add(authorized, item, status_after="UNREAD", progress_after=0)["progress"]
    assert unread["progress_percent"] == 0 and unread["started_at"] == progress["started_at"]
    again = add(authorized, item, started_at="2026-09-03T01:00:00Z")["progress"]
    assert again["started_at"] == progress["started_at"]
    detail = authorized.get(f"/api/v1/resources/{item['id']}").json()["data"]
    assert {k: v for k, v in detail.items() if k != "progress"} == {
        k: v for k, v in original.items() if k != "progress"
    }
    history = authorized.get(record_path(item)).json()
    assert history["page"]["total_items"] == 8
    assert first["record"] in history["data"]
    assert all("pasted_content" not in entry for entry in history["data"])
    with TestClient(create_app(), base_url="http://127.0.0.1:8000") as restarted:
        authorize(restarted)
        assert restarted.get(record_path(item)).json() == history


@pytest.mark.parametrize("before", STATUSES)
@pytest.mark.parametrize("after", STATUSES)
def test_matrix_and_review_plan_preservation(
    authorized: TestClient,
    item: dict[str, Any],
    session_factory: sessionmaker[Session],
    before: str,
    after: str,
) -> None:
    # ARCHIVED remembers REVIEW_DUE for this complete 5x5 matrix.
    expected = {
        "UNREAD": {"UNREAD", "IN_PROGRESS", "ARCHIVED"},
        "IN_PROGRESS": set(STATUSES),
        "COMPLETED": {"IN_PROGRESS", "COMPLETED", "REVIEW_DUE", "ARCHIVED"},
        "REVIEW_DUE": {"IN_PROGRESS", "COMPLETED", "REVIEW_DUE", "ARCHIVED"},
        "ARCHIVED": {"ARCHIVED", "REVIEW_DUE"},
    }
    now = datetime(2026, 9, 1, tzinfo=UTC)
    current = 0 if before == "UNREAD" else 45
    plan_status = (
        "PAUSED"
        if before == "REVIEW_DUE" and after in {"IN_PROGRESS", "COMPLETED"}
        else "SCHEDULED"
        if "REVIEW_DUE" in (before, after) or before == "ARCHIVED"
        else None
    )
    with session_factory.begin() as session:
        progress = session.get(LearningProgress, UUID(item["id"]))
        assert progress is not None
        progress.status, progress.progress_percent = before, current
        progress.started_at = None if before == "UNREAD" else now
        progress.completed_at = now if before in {"COMPLETED", "REVIEW_DUE", "ARCHIVED"} else None
        progress.archived_from_status = "REVIEW_DUE" if before == "ARCHIVED" else None
        if plan_status:
            session.add(
                ActiveReviewPlan(
                    resource_id=progress.resource_id,
                    status=plan_status,
                    due_date=date(2026, 9, 12) if plan_status == "SCHEDULED" else None,
                )
            )
    snapshot = authorized.get(f"/api/v1/resources/{item['id']}").json()["data"]
    response = authorized.post(
        record_path(item),
        json=body(
            snapshot,
            status_after=after,
            progress_after=0 if after == "UNREAD" else current,
        ),
    )
    if after not in expected[before]:
        check_error(response, 409, "INVALID_STATE_TRANSITION")
    else:
        assert response.status_code == 201, response.text
        updated = response.json()["data"]["progress"]
        assert updated["status"] == after
        assert updated["version"] == snapshot["progress"]["version"] + (before != after)
        assert updated["archived_from_status"] == (
            ("REVIEW_DUE" if before == "ARCHIVED" else before) if after == "ARCHIVED" else None
        )
    final = authorized.get(f"/api/v1/resources/{item['id']}").json()["data"]
    assert final["review_plan"] == snapshot["review_plan"]


@pytest.mark.parametrize(
    "values,code",
    [
        ({"expected_progress_version": 999}, "VERSION_CONFLICT"),
        ({"progress_before": 99}, "STATE_CONFLICT"),
        ({"status_before": "COMPLETED"}, "STATE_CONFLICT"),
        ({"status_after": "COMPLETED"}, "INVALID_STATE_TRANSITION"),
        ({"status_after": "UNREAD", "progress_after": 5}, "STATE_CONFLICT"),
        ({"status_after": "UNREAD", "progress_after": 0, "summary": "  "}, "STATE_CONFLICT"),
        ({"status_after": "ARCHIVED", "progress_after": 20}, "STATE_CONFLICT"),
    ],
)
def test_failed_commands_leave_no_history(
    authorized: TestClient,
    item: dict[str, Any],
    values: dict[str, Any],
    code: str,
) -> None:
    check_error(
        authorized.post(record_path(item), json=body(item, **values)),
        409,
        code,
        {"current_version": 1} if code == "VERSION_CONFLICT" else None,
    )
    assert authorized.get(record_path(item)).json()["data"] == []
    assert authorized.get(f"/api/v1/resources/{item['id']}").json()["data"] == item


def test_review_entry_requires_plan_and_exit_does_not_pause_it(
    authorized: TestClient,
    item: dict[str, Any],
    session_factory: sessionmaker[Session],
) -> None:
    add(authorized, item)
    check_error(
        authorized.post(record_path(item), json=body(item, status_after="REVIEW_DUE")),
        409,
        "STATE_CONFLICT",
    )
    with session_factory.begin() as session:
        session.add(
            ActiveReviewPlan(
                resource_id=UUID(item["id"]),
                due_date=date(2026, 9, 15),
                status="SCHEDULED",
            )
        )
    add(authorized, item, status_after="REVIEW_DUE")
    before = authorized.get(f"/api/v1/resources/{item['id']}").json()["data"]
    check_error(authorized.post(record_path(item), json=body(item)), 409, "STATE_CONFLICT")
    assert authorized.get(f"/api/v1/resources/{item['id']}").json()["data"] == before


@pytest.mark.parametrize("remembered", ["UNREAD", "IN_PROGRESS", "COMPLETED"])
def test_archive_only_restores_remembered_state(
    authorized: TestClient,
    item: dict[str, Any],
    remembered: str,
) -> None:
    if remembered != "UNREAD":
        add(authorized, item)
    if remembered == "COMPLETED":
        add(authorized, item, status_after="COMPLETED")
    before = dict(item["progress"])
    percent = before["progress_percent"]
    add(authorized, item, status_after="ARCHIVED", progress_after=percent)
    check_error(
        authorized.post(
            record_path(item),
            json=body(
                item,
                status_after=remembered,
                progress_after=percent + 1,
            ),
        ),
        409,
        "STATE_CONFLICT",
    )
    wrong = "COMPLETED" if remembered != "COMPLETED" else "UNREAD"
    check_error(
        authorized.post(
            record_path(item),
            json=body(
                item,
                status_after=wrong,
                progress_after=percent,
            ),
        ),
        409,
        "INVALID_STATE_TRANSITION",
    )
    restored = add(authorized, item, status_after=remembered, progress_after=percent)["progress"]
    for field in (
        "status",
        "progress_percent",
        "started_at",
        "completed_at",
        "archived_from_status",
    ):
        assert restored[field] == before[field]


@pytest.mark.usefixtures("database")
def test_ready_file_can_be_learned_without_touching_original(authorized: TestClient) -> None:
    created = authorized.post(
        "/api/v1/resources",
        data={"source_type": "FILE", "title": "合成文件"},
        files={"file": ("synthetic.txt", b"synthetic note", "text/plain")},
    )
    assert created.status_code == 201, created.text
    item = created.json()["data"]
    original = dict(item["original_file"])
    add(authorized, item)
    changed = authorized.get(f"/api/v1/resources/{item['id']}").json()["data"]
    assert changed["original_file"] == original
    assert changed["progress"]["progress_percent"] == 30
    filtered = authorized.get(
        "/api/v1/resources",
        params={
            "source_type": "FILE",
            "learning_status": "IN_PROGRESS",
            "progress_min": 30,
        },
    ).json()["data"]
    assert [row["id"] for row in filtered] == [item["id"]]
    assert authorized.get("/api/v1/study-records").json()["page"]["total_items"] == 1


@pytest.mark.parametrize(
    "values",
    [
        {"expected_progress_version": None},
        {"expected_progress_version": True},
        {"expected_progress_version": "1"},
        {"duration_seconds": -1},
        {"duration_seconds": 86401},
        {"duration_seconds": 1.5},
        {"duration_seconds": True},
        {"progress_after": 101},
        {"progress_after": -1},
        {"progress_after": True},
        {"progress_before": "0"},
        {"started_at": "2026-09-02T10:00:00"},
        {"started_at": 1780000000},
        {"started_at": "2026-02-30T10:00:00Z"},
        {"started_at": None},
        {"status_after": "FINISHED"},
        {"summary": 42},
        {"questions_next": "x" * 5001},
        {"summary": "x" * 5001},
        {"resource_id": str(uuid4())},
        {"version": 1},
    ],
)
def test_invalid_body_before_database(
    authorized: TestClient,
    runtime: RuntimePaths,
    values: dict[str, Any],
) -> None:
    dummy = {
        "id": str(uuid4()),
        "progress": {"version": 1, "status": "UNREAD", "progress_percent": 0},
    }
    check_error(
        authorized.post(record_path(dummy), json=body(dummy, **values)), 422, "VALIDATION_ERROR"
    )
    assert not runtime.database.exists()


@pytest.mark.parametrize(
    "missing",
    [
        "expected_progress_version",
        "started_at",
        "duration_seconds",
        "progress_before",
        "progress_after",
        "status_before",
        "status_after",
    ],
)
def test_required_body_fields(
    authorized: TestClient,
    runtime: RuntimePaths,
    missing: str,
) -> None:
    dummy = {
        "id": str(uuid4()),
        "progress": {"version": 1, "status": "UNREAD", "progress_percent": 0},
    }
    command = body(dummy)
    command.pop(missing)
    check_error(authorized.post(record_path(dummy), json=command), 422, "VALIDATION_ERROR")
    assert not runtime.database.exists()


@pytest.mark.parametrize(
    "query",
    [
        "page=0",
        "page=1.1",
        "page_size=101",
        "page_size=",
        "page=1&page=2",
        "sort=id",
        "sort=summary",
        "sort=",
        "q=x",
        "status=UNREAD",
        "resource_id=",
        "topic_id=bad",
        "started_from=2026-09-03",
        "started_to=1780000000",
        "started_from=2026-02-30T00:00:00Z",
        "started_from=2026-09-03T00:00:00Z&started_to=2026-09-02T00:00:00Z",
    ],
)
def test_invalid_query_before_database(
    authorized: TestClient,
    runtime: RuntimePaths,
    query: str,
) -> None:
    check_error(authorized.get("/api/v1/study-records?" + query), 422, "VALIDATION_ERROR")
    assert not runtime.database.exists()


def test_paging_filters_ties_archived_and_unknown_ids(
    authorized: TestClient,
    item: dict[str, Any],
) -> None:
    first = add(authorized, item, duration_seconds=0)["record"]
    second = add(authorized, item, duration_seconds=86400)["record"]
    topic = authorized.post("/api/v1/topics", json={"name": "学习筛选"}).json()["data"]
    other = authorized.post(
        "/api/v1/resources",
        json={
            "source_type": "WEB",
            "title": "另一资料",
            "source_url": "https://example.test",
            "topic_id": topic["id"],
        },
    ).json()["data"]
    add(authorized, other, started_at="2026-09-03T00:00:00Z")
    path = "/api/v1/study-records"
    page = authorized.get(path, params={"page_size": 1}).json()
    assert page["page"] == {
        "number": 1,
        "size": 1,
        "total_items": 3,
        "total_pages": 3,
        "has_more": True,
    }
    ordered = authorized.get(record_path(item)).json()["data"]
    assert [r["id"] for r in ordered] == sorted([first["id"], second["id"]])
    for sort, expected in [("duration_seconds", first), ("-duration_seconds", second)]:
        assert (
            authorized.get(record_path(item), params={"sort": sort}).json()["data"][0] == expected
        )
    selected = authorized.get(
        path,
        params={
            "started_from": "2026-09-02T10:00:00+08:00",
            "started_to": "2026-09-03T00:00:00Z",
        },
    ).json()["data"]
    assert len(selected) == 2
    assert len(authorized.get(path, params={"topic_id": topic["id"]}).json()["data"]) == 1
    assert len(authorized.get(path, params={"resource_id": item["id"]}).json()["data"]) == 2
    for params in [
        {"resource_id": str(uuid4())},
        {"topic_id": str(uuid4())},
        {"page": str(10**30)},
        {"topic_id": topic["id"], "resource_id": item["id"]},
        {"started_from": WHEN, "started_to": WHEN},
    ]:
        assert authorized.get(path, params=params).json()["data"] == []
    check_error(
        authorized.get(record_path(item), params={"topic_id": topic["id"]}), 422, "VALIDATION_ERROR"
    )
    add(authorized, item, status_after="ARCHIVED", progress_after=30)
    assert authorized.get(record_path(item)).json()["page"]["total_items"] == 3
    assert authorized.get(path).json()["page"]["total_items"] == 4
    for target in [
        "/api/v1/resources/no-id/study-records",
        f"/api/v1/resources/{uuid4()}/study-records",
    ]:
        check_error(authorized.get(target), 404, "RESOURCE_NOT_FOUND")
        check_error(authorized.post(target, json=body(item)), 404, "RESOURCE_NOT_FOUND")


@pytest.mark.parametrize("stage", ["insert", "update", "commit"])
def test_atomic_rollback_at_each_boundary(
    authorized: TestClient,
    item: dict[str, Any],
    stage: str,
) -> None:
    def reject(*args: Any) -> None:
        raise RuntimeError("private synthetic SQL")

    target, name = (
        (StudyRecord, "before_insert")
        if stage == "insert"
        else (LearningProgress, "before_update")
        if stage == "update"
        else (Session, "before_commit")
    )
    event.listen(target, name, reject)
    try:
        check_error(authorized.post(record_path(item), json=body(item)), 500, "UNKNOWN_ERROR")
    finally:
        event.remove(target, name, reject)
    assert authorized.get(record_path(item)).json()["data"] == []
    assert authorized.get(f"/api/v1/resources/{item['id']}").json()["data"] == item


def test_concurrent_old_writes_and_stale_replay_do_not_overwrite(
    authorized: TestClient,
    item: dict[str, Any],
    session_factory: sessionmaker[Session],
) -> None:
    command = body(item)
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(
            executor.map(
                lambda _: authorized.post(record_path(item), json=command),
                range(2),
            )
        )
    assert sum(r.status_code == 201 for r in responses) == 1
    for response in responses:
        assert response.status_code in {201, 409, 500}
        if response.status_code != 201:
            check_error(
                response,
                response.status_code,
                "VERSION_CONFLICT" if response.status_code == 409 else "UNKNOWN_ERROR",
                {"current_version": 2} if response.status_code == 409 else None,
            )
    check_error(
        authorized.post(record_path(item), json=command),
        409,
        "VERSION_CONFLICT",
        {"current_version": 2},
    )
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(StudyRecord)) == 1
    assert (
        authorized.get(f"/api/v1/resources/{item['id']}").json()["data"]["progress"]["version"] == 2
    )


def test_stale_orm_failure_is_not_replayed(
    authorized: TestClient,
    item: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    add(authorized, item)
    calls = 0

    def stale(self: LearningStore, *args: Any) -> None:
        nonlocal calls
        calls += 1
        raise StaleDataError("private synthetic SQL")

    monkeypatch.setattr(LearningStore, "create", stale)
    check_error(
        authorized.post(record_path(item), json=body(item, expected_progress_version=1)),
        409,
        "VERSION_CONFLICT",
        {"current_version": 2},
    )
    check_error(authorized.post(record_path(item), json=body(item)), 500, "UNKNOWN_ERROR")
    assert calls == 2
    assert authorized.get(record_path(item)).json()["page"]["total_items"] == 1


@pytest.mark.parametrize("state", ["PENDING", "FAILED", "missing"])
def test_unavailable_files_are_not_read_or_written(
    authorized: TestClient,
    database: Any,
    session_factory: sessionmaker[Session],
    state: str,
) -> None:
    with session_factory.begin() as session:
        parent = resource(session, source_type="FILE", source_url=None)
        identity = parent.id
        session.add(LearningProgress(resource_id=identity))
        session.add(
            StudyRecord(
                resource_id=identity,
                started_at=datetime(2026, 9, 1, tzinfo=UTC),
                duration_seconds=0,
                progress_before=0,
                progress_after=0,
                status_before="UNREAD",
                status_after="UNREAD",
                summary="hidden synthetic history",
            )
        )
        if state != "missing":
            session.add(
                OriginalFile(
                    resource_id=identity,
                    original_name="synthetic.txt",
                    size_bytes=1,
                    media_type="text/plain; charset=utf-8",
                    sha256="a" * 64,
                    storage_key=f"{identity}/original",
                    status=state,
                    failure_code="FILE_CORRUPTED" if state == "FAILED" else None,
                )
            )
    dummy = {
        "id": str(identity),
        "progress": {"version": 1, "status": "UNREAD", "progress_percent": 0},
    }
    check_error(authorized.get(record_path(dummy)), 404, "RESOURCE_NOT_FOUND")
    check_error(authorized.post(record_path(dummy), json=body(dummy)), 404, "RESOURCE_NOT_FOUND")
    assert authorized.get("/api/v1/study-records").json()["data"] == []


def test_http_safety_and_nonexistent_schema(
    authorized: TestClient,
    runtime: RuntimePaths,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = f"/api/v1/resources/{uuid4()}/study-records"
    for content in [b"{", b'{"duration_seconds":NaN}', b'{"duration_seconds":Infinity}']:
        check_error(
            authorized.post(path, content=content, headers={"content-type": "application/json"}),
            400,
            "MALFORMED_REQUEST",
        )
    check_error(
        authorized.post(path, content="private synthetic", headers={"content-type": "text/plain"}),
        415,
        "CONTENT_TYPE_UNSUPPORTED",
    )
    assert not runtime.database.exists()

    async def forbidden_body(self: Request) -> bytes:
        raise AssertionError("must reject before reading body")

    monkeypatch.setattr(Request, "body", forbidden_body)
    for headers, code in [
        ({"X-StudyPilot-Token": ""}, "LOCAL_TOKEN_INVALID"),
        ({"Origin": "https://untrusted.test"}, "REQUEST_ORIGIN_FORBIDDEN"),
    ]:
        check_error(authorized.post(path, content="private synthetic", headers=headers), 403, code)
    assert not runtime.database.exists()
    check_error(authorized.get("/api/v1/study-records"), 500, "UNKNOWN_ERROR")
    del authorized.headers["X-StudyPilot-Token"]
    check_error(authorized.post(path, content="private synthetic"), 403, "LOCAL_TOKEN_REQUIRED")


def test_contract_shapes_catalog_and_no_history_mutators(
    authorized: TestClient,
    item: dict[str, Any],
) -> None:
    document = json.loads(
        (Path(__file__).resolve().parents[2] / "docs/contracts/openapi-v1.json").read_text()
    )
    schemas = document["components"]["schemas"]
    result = add(authorized, item)
    for value, name in [
        (result, "StudyRecordResult"),
        (result["record"], "StudyRecord"),
        (result["progress"], "LearningProgress"),
        (authorized.get(record_path(item)).json(), "StudyRecordPage"),
    ]:
        assert set(value) == set(schemas[name]["properties"]) == set(schemas[name]["required"])
    create_fields = StudyRecordCreate.model_fields
    assert set(create_fields) == set(schemas["StudyRecordCreate"]["properties"])
    assert {key for key, field in create_fields.items() if field.is_required()} == set(
        schemas["StudyRecordCreate"]["required"]
    )
    available = document["x-delivery-profile"]["available_operations"]
    assert {"createResourceStudyRecord", "listResourceStudyRecords", "listStudyRecords"} <= set(
        available
    )
    for method in ["PATCH", "PUT", "DELETE"]:
        response = authorized.request(method, record_path(item), json={"summary": "overwrite"})
        assert response.status_code == 405
    assert authorized.get(record_path(item)).json()["data"] == [result["record"]]
