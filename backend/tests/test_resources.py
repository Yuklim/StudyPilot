"""Real HTTP/SQLite resource behavior; synthetic data and isolated fixtures only."""

import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, event, func, select
from sqlalchemy.orm import Session, sessionmaker
from support import RuntimePaths, resource

from studypilot.infrastructure.database.models import (
    ActiveReviewPlan,
    LearningProgress,
    LearningResource,
    OriginalFile,
    ResourceTag,
    Tag,
    Topic,
)
from studypilot.infrastructure.database.resource_store import ResourceStore
from studypilot.main import create_app

CONTEXT = {"sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty"}
WEB = {
    "source_type": "WEB",
    "title": "  示例资料  ",
    "source_url": "https://example.test/doc?q=kept",
}
PASTE = {
    "source_type": "PASTE",
    "title": "摘录",
    "pasted_content": "  # 原文\n<script>synthetic</script>\n",
}


@pytest.fixture
def authorized(client: TestClient) -> TestClient:
    token = client.get("/api/v1/local-session", headers=CONTEXT).json()["data"]["token"]
    client.headers.update(
        {**CONTEXT, "Origin": "http://127.0.0.1:5173", "X-StudyPilot-Token": token}
    )
    return client


def assert_error(response: Any, status: int, code: str) -> None:
    assert response.status_code == status
    error = response.json()["error"]
    assert set(error) == {"code", "message", "details", "request_id"}
    assert error["code"] == code
    assert error["details"] == {}
    assert error["request_id"] == response.headers["x-request-id"]
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.usefixtures("database")
@pytest.mark.parametrize("body", [WEB, PASTE])
def test_create_read_list_and_restart(authorized: TestClient, body: dict[str, str]) -> None:
    response = authorized.post("/api/v1/resources", json=body)
    assert response.status_code == 201, response.text
    detail = response.json()["data"]
    identity = detail["id"]
    assert UUID(identity).version == 4 and str(UUID(identity)) == identity
    assert detail["title"] == body["title"].strip()
    assert detail["version"] == 1
    assert detail["progress"] == {
        "resource_id": identity,
        "status": "UNREAD",
        "progress_percent": 0,
        "started_at": None,
        "completed_at": None,
        "archived_from_status": None,
        "version": 1,
        "updated_at": detail["progress"]["updated_at"],
    }
    for stamp in (detail["created_at"], detail["updated_at"], detail["progress"]["updated_at"]):
        assert datetime.fromisoformat(stamp).utcoffset() == timedelta(0)
    assert (
        detail["tags"] == [] and detail["review_plan"] is None and detail["original_file"] is None
    )
    source_field = "source_url" if body["source_type"] == "WEB" else "pasted_content"
    assert detail[source_field] == body[source_field]
    assert authorized.get(f"/api/v1/resources/{identity}").json()["data"] == detail
    page = authorized.get("/api/v1/resources").json()
    assert page["page"] == {
        "number": 1,
        "size": 20,
        "total_items": 1,
        "total_pages": 1,
        "has_more": False,
    }
    assert page["data"] == [{key: value for key, value in detail.items() if key != source_field}]
    with TestClient(create_app(), base_url="http://127.0.0.1:8000") as restarted:
        token = restarted.get("/api/v1/local-session", headers=CONTEXT).json()["data"]["token"]
        result = restarted.get(
            f"/api/v1/resources/{identity}", headers={"X-StudyPilot-Token": token}
        )
        assert result.status_code == 200 and result.json()["data"] == detail


@pytest.mark.parametrize(
    "changes",
    [
        {"unexpected": "synthetic private"},
        {"title": "   "},
        {"title": 123},
        {"title": "x" * 201},
        {"source_name": "x" * 121},
        {"save_reason": "x" * 1001},
        {"topic_id": "invalid"},
        {"tag_ids": [str(uuid4())] * 2},
        {"tag_ids": [str(uuid4()) for _ in range(21)]},
        {"tag_ids": None},
        {"source_type": "FILE"},
        {"source_url": None},
        {"pasted_content": None},
        {"pasted_content": "not allowed"},
        {"source_url": "javascript:alert(1)"},
        {"source_url": "https://user:pass@example.test/private"},
        {"source_url": "https://example.test/path#private"},
        {"source_url": "https://example.test/#"},
        {"source_url": "https:///no-host"},
        {"source_url": "https://example.test:invalid/path"},
        {"source_url": "https://[broken"},
        {"source_url": "https://example.test\n/path"},
        {"source_url": "https://example.test/" + "x" * 2048},
    ],
)
def test_invalid_create_rejected_before_database(
    authorized: TestClient, runtime: RuntimePaths, changes: dict[str, Any]
) -> None:
    assert_error(authorized.post("/api/v1/resources", json=WEB | changes), 422, "VALIDATION_ERROR")
    assert not runtime.database.exists()


@pytest.mark.parametrize("content", ["", "x" * 1_000_001, None, 100])
def test_paste_bounds_before_database(
    authorized: TestClient, runtime: RuntimePaths, content: Any
) -> None:
    assert_error(
        authorized.post("/api/v1/resources", json=PASTE | {"pasted_content": content}),
        422,
        "VALIDATION_ERROR",
    )
    assert not runtime.database.exists()


def test_malformed_and_unsupported_before_database(
    authorized: TestClient, runtime: RuntimePaths
) -> None:
    for body in ('{"title":', "", '{"source_type":"PASTE","pasted_content":NaN}'):
        result = authorized.post(
            "/api/v1/resources", content=body, headers={"Content-Type": "application/json"}
        )
        assert_error(result, 400, "MALFORMED_REQUEST")
    for media in (
        "text/plain",
        "application/x-www-form-urlencoded",
        "multipart/form-data; boundary=x",
    ):
        result = authorized.post(
            "/api/v1/resources", content="synthetic", headers={"Content-Type": media}
        )
        assert_error(result, 415, "CONTENT_TYPE_UNSUPPORTED")
    assert not runtime.database.exists()


@pytest.mark.parametrize(
    "query",
    [
        "page=0",
        "page_size=101",
        "page=1&page=2",
        "page=1.1",
        "page=1.0",
        "q=",
        "q=%20",
        "unexpected=1",
        "sort=source_url",
        "sort=created_at,id",
        "topic_id=",
        "tag_id=",
        "source_type=",
        "learning_status=",
        "source_type=UNKNOWN",
        "learning_status=UNKNOWN",
        "progress_min=-1",
        "progress_max=101",
        "progress_min=70&progress_max=20",
        "created_from=2026-09-03",
        "created_from=1234567890",
        "created_from=2026-09-03T00:00:00",
        "updated_to=2026-02-30T00:00:00Z",
        "created_from=2026-09-03T00:00:00Z&created_to=2026-09-02T00:00:00Z",
        "topic_unassigned=1",
        f"topic_id={uuid4()}&topic_unassigned=true",
    ],
)
def test_invalid_query_before_database(
    authorized: TestClient, runtime: RuntimePaths, query: str
) -> None:
    assert_error(authorized.get("/api/v1/resources?" + query), 422, "VALIDATION_ERROR")
    assert not runtime.database.exists()


def test_errors_do_not_echo_inputs_or_internal_failures(
    authorized: TestClient,
    session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
    runtime: RuntimePaths,
    caplog: pytest.LogCaptureFixture,
) -> None:
    assert_error(authorized.get(f"/api/v1/resources/{uuid4()}"), 404, "RESOURCE_NOT_FOUND")
    assert_error(authorized.get("/api/v1/resources/not-a-uuid"), 404, "RESOURCE_NOT_FOUND")
    for field, code in (("topic_id", "TOPIC_NOT_FOUND"), ("tag_ids", "TAG_NOT_FOUND")):
        identity = str(uuid4())
        result = authorized.post(
            "/api/v1/resources", json=WEB | {field: [identity] if field == "tag_ids" else identity}
        )
        assert_error(result, 404, code)
    marker = "synthetic-secret-SQL-private-body"

    def fail_after_insert(self: ResourceStore, resource_id: UUID, tags: list[UUID]) -> None:
        raise RuntimeError(marker + str(runtime.database))

    monkeypatch.setattr(ResourceStore, "attach_tags", fail_after_insert)
    result = authorized.post("/api/v1/resources", json=PASTE | {"pasted_content": marker})
    assert_error(result, 500, "UNKNOWN_ERROR")
    assert marker not in result.text + caplog.text
    assert str(runtime.database) not in result.text + caplog.text
    with session_factory() as session:
        for model in (LearningResource, LearningProgress, ResourceTag):
            assert session.scalar(select(func.count()).select_from(model)) == 0


def test_commit_failure_rolls_back(
    authorized: TestClient,
    database: Engine,
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory.begin() as session:
        tag = Tag(name="提交回滚测试")
        session.add(tag)
        session.flush()
        tag_id = str(tag.id)

    def reject_commit(session: Session) -> None:
        raise RuntimeError("synthetic private commit failure")

    event.listen(Session, "before_commit", reject_commit)
    try:
        assert_error(
            authorized.post("/api/v1/resources", json=WEB | {"tag_ids": [tag_id]}),
            500,
            "UNKNOWN_ERROR",
        )
    finally:
        event.remove(Session, "before_commit", reject_commit)
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(LearningResource)) == 0
        assert session.scalar(select(func.count()).select_from(LearningProgress)) == 0
        assert session.scalar(select(func.count()).select_from(ResourceTag)) == 0
        assert session.scalar(select(func.count()).select_from(Tag)) == 1


def test_maximum_paste_is_preserved_but_not_searched(
    authorized: TestClient,
    database: Engine,
) -> None:
    body = "文" * 1_000_000
    result = authorized.post("/api/v1/resources", json=PASTE | {"pasted_content": body})
    assert result.status_code == 201
    assert result.json()["data"]["pasted_content"] == body
    assert authorized.get("/api/v1/resources?q=文文").json()["data"] == []
    summary = authorized.get("/api/v1/resources").json()["data"][0]
    assert "pasted_content" not in summary


@pytest.mark.parametrize("sort", ["created_at", "updated_at", "title", "progress_percent"])
def test_sort_directions_with_distinct_values(
    authorized: TestClient,
    session_factory: sessionmaker[Session],
    sort: str,
) -> None:
    identities = []
    with session_factory.begin() as session:
        for index in (1, 2, 3):
            stamp = datetime(2026, 9, index, tzinfo=UTC)
            record = resource(session, title=f"T{index}", created_at=stamp, updated_at=stamp)
            identities.append(str(record.id))
            session.add(
                LearningProgress(
                    resource_id=record.id,
                    status="IN_PROGRESS",
                    progress_percent=index,
                    started_at=stamp,
                )
            )
    for prefix, expected in (("", identities), ("-", identities[::-1])):
        result = authorized.get(f"/api/v1/resources?sort={prefix}{sort}").json()["data"]
        assert [row["id"] for row in result] == expected


def test_security_still_precedes_real_resource_route(
    client: TestClient, runtime: RuntimePaths
) -> None:
    result = client.post(
        "/api/v1/resources",
        content="broken body",
        headers={**CONTEXT, "Origin": "http://127.0.0.1:5173"},
    )
    assert_error(result, 403, "LOCAL_TOKEN_REQUIRED")
    assert not runtime.database.exists()
    assert client.get("/health").json() == {"status": "ok", "service": "StudyPilot"}


def test_schema_is_not_automatically_created(authorized: TestClient, runtime: RuntimePaths) -> None:
    assert_error(authorized.post("/api/v1/resources", json=WEB), 500, "UNKNOWN_ERROR")
    # Explicit business access may create the file, but must not create tables.
    assert runtime.database.exists()


def test_classification_filters_projection_and_read_stability(
    authorized: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    stamp = datetime(2026, 9, 1, tzinfo=UTC)
    with session_factory.begin() as session:
        topic, tag1, tag2 = Topic(name="课程"), Tag(name="实践"), Tag(name="精读")
        session.add_all([topic, tag1, tag2])
        session.flush()
        topic_id, tag_ids = str(topic.id), [str(tag1.id), str(tag2.id)]
    response = authorized.post(
        "/api/v1/resources",
        json=WEB
        | {
            "title": "ＦａｓｔＡＰＩ　 Guide",  # noqa: RUF001 - test NFKC fullwidth folding
            "source_name": "Straße",
            "save_reason": "  路由\n  实践 ",
            "topic_id": topic_id,
            "tag_ids": tag_ids,
        },
    )
    assert response.status_code == 201
    created = response.json()["data"]
    assert {tag["id"] for tag in created["tags"]} == set(tag_ids)
    assert all(
        set(tag) == {"id", "name", "version", "created_at", "updated_at"} for tag in created["tags"]
    )
    with session_factory.begin() as session:
        existing = session.get(LearningResource, UUID(created["id"]))
        assert existing is not None
        existing.created_at = stamp
        existing.updated_at = stamp
        progress = session.get(LearningProgress, existing.id)
        assert progress is not None
        progress.status, progress.progress_percent, progress.started_at = "IN_PROGRESS", 35, stamp
        session.add(ActiveReviewPlan(resource_id=existing.id, status="PAUSED", due_date=None))
        archived = resource(session, title="归档", source_url="https://example.test/private-needle")
        session.add(
            LearningProgress(
                resource_id=archived.id, status="ARCHIVED", archived_from_status="UNREAD"
            )
        )
        pasted = resource(
            session,
            title="其他",
            source_type="PASTE",
            source_url=None,
            pasted_content="private-needle",
        )
        session.add(LearningProgress(resource_id=pasted.id))
    detail_before = authorized.get(f"/api/v1/resources/{created['id']}").json()["data"]
    assert detail_before["review_plan"]["status"] == "PAUSED"
    assert detail_before["review_plan"]["due_date"] is None
    for query in (
        "q=fastapi%20guide",
        "q=STRASSE",
        "q=路由%20实践",
        f"topic_id={topic_id}",
        f"tag_id={tag_ids[0]}&tag_id={tag_ids[1]}",
        "progress_min=35&progress_max=35",
        "created_from=2026-09-01T00:00:00Z&created_to=2026-09-02T00:00:00Z",
        "updated_from=2026-09-01T00:00:00Z&updated_to=2026-09-02T00:00:00Z",
        "source_type=WEB&source_type=FILE&learning_status=IN_PROGRESS&learning_status=COMPLETED",
    ):
        result = authorized.get("/api/v1/resources?" + query)
        assert result.status_code == 200, result.text
        assert [row["id"] for row in result.json()["data"]] == [created["id"]], query
    for query in (
        "q=private-needle",
        f"tag_id={tag_ids[0]}&tag_id={uuid4()}",
        f"topic_id={uuid4()}",
        "progress_min=36",
        "progress_max=34&source_type=WEB",
        "created_to=2026-09-01T00:00:00Z",
        "q=STRASSE&source_type=PASTE",
    ):
        assert authorized.get("/api/v1/resources?" + query).json()["data"] == [], query
    assert (
        authorized.get("/api/v1/resources?topic_unassigned=true").json()["page"]["total_items"] == 1
    )
    assert (
        authorized.get("/api/v1/resources?topic_unassigned=false").json()["page"]["total_items"]
        == 2
    )
    assert (
        authorized.get("/api/v1/resources?learning_status=ARCHIVED").json()["page"]["total_items"]
        == 1
    )
    assert authorized.get(f"/api/v1/resources/{created['id']}").json()["data"] == detail_before


@pytest.mark.parametrize("sort", ["created_at", "updated_at", "title", "progress_percent"])
def test_stable_sort_pages_and_both_directions(
    authorized: TestClient,
    session_factory: sessionmaker[Session],
    sort: str,
) -> None:
    stamp = datetime(2026, 9, 1, tzinfo=UTC)
    identities = [UUID(int=value, version=4) for value in (3, 1, 2)]
    with session_factory.begin() as session:
        for identity in identities:
            record = resource(
                session, id=identity, title="same", created_at=stamp, updated_at=stamp
            )
            session.add(LearningProgress(resource_id=record.id))
    for prefix in ("", "-"):
        responses = [
            authorized.get(f"/api/v1/resources?sort={prefix}{sort}&page_size=1&page={page}").json()
            for page in (1, 2, 3, 4)
        ]
        assert [data["data"][0]["id"] for data in responses[:3]] == sorted(map(str, identities))
        assert responses[0]["page"]["has_more"] is True
        assert responses[2]["page"]["has_more"] is False
        assert responses[3] == {
            "data": [],
            "page": {"number": 4, "size": 1, "total_items": 3, "total_pages": 3, "has_more": False},
        }


def test_empty_page(authorized: TestClient, database: Engine) -> None:
    assert authorized.get("/api/v1/resources?page=3").json() == {
        "data": [],
        "page": {"number": 3, "size": 20, "total_items": 0, "total_pages": 0, "has_more": False},
    }


def test_only_ready_files_visible_and_internal_fields_absent(
    authorized: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    identities = {}
    with session_factory.begin() as session:
        for status in ("READY", "PENDING", "FAILED"):
            record = resource(session, title=status, source_type="FILE", source_url=None)
            identities[status] = str(record.id)
            session.add(LearningProgress(resource_id=record.id))
            session.add(
                OriginalFile(
                    resource_id=record.id,
                    original_name="synthetic.txt",
                    storage_key=f"internal-storage-{status}",
                    size_bytes=10,
                    media_type="text/plain; charset=utf-8",
                    sha256="a" * 64,
                    status=status,
                    failure_code="synthetic" if status == "FAILED" else None,
                )
            )
    response = authorized.get("/api/v1/resources?source_type=FILE")
    rows = response.json()["data"]
    assert [row["id"] for row in rows] == [identities["READY"]]
    assert set(rows[0]["original_file"]) == {
        "id",
        "original_name",
        "size_bytes",
        "media_type",
        "status",
    }
    assert "sha256" not in response.text and "internal-storage" not in response.text
    for status in ("PENDING", "FAILED"):
        assert_error(
            authorized.get(f"/api/v1/resources/{identities[status]}"), 404, "RESOURCE_NOT_FOUND"
        )
    detail = authorized.get(f"/api/v1/resources/{identities['READY']}").json()["data"]
    assert detail["original_file"]["sha256"] == "a" * 64
    assert "storage_key" not in json.dumps(detail) and "staging_key" not in json.dumps(detail)
