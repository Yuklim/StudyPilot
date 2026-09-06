"""Frozen content snapshots against isolated HTTP/SQLite: the text lives beside the URL."""

from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, event, func, select
from sqlalchemy.orm import Session, sessionmaker

from studypilot.infrastructure.database.models import ContentSnapshot, LearningResource
from studypilot.main import create_app

CONTEXT = {"sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty"}
MARKDOWN = "# 标题\n\n正文第一段。\n\n```py\nprint('x')\n```\n"


def authorize(client: TestClient) -> TestClient:
    token = client.get("/api/v1/local-session", headers=CONTEXT).json()["data"]["token"]
    client.headers.update(
        {**CONTEXT, "Origin": "http://127.0.0.1:5173", "X-StudyPilot-Token": token}
    )
    return client


@pytest.fixture
def authorized(client: TestClient) -> TestClient:
    return authorize(client)


def error(response: Any, status: int, code: str, details: dict[str, int] | None = None) -> None:
    assert response.status_code == status, response.text
    body = response.json()["error"]
    assert set(body) == {"code", "message", "details", "request_id"}
    assert body["code"] == code and body["details"] == (details or {})
    assert body["request_id"] == response.headers["x-request-id"]
    assert response.headers["cache-control"] == "no-store"


def web(client: TestClient, title: str = "网页资料") -> dict[str, Any]:
    response = client.post(
        "/api/v1/resources",
        json={
            "source_type": "WEB",
            "title": title,
            "source_url": "https://example.test/article",
        },
    )
    assert response.status_code == 201, response.text
    return dict(response.json()["data"])


def path(resource: dict[str, Any]) -> str:
    return f"/api/v1/resources/{resource['id']}/snapshot"


@pytest.mark.usefixtures("database")
def test_snapshot_lives_beside_the_source_url_and_replaces_wholesale(
    authorized: TestClient,
) -> None:
    resource = web(authorized)
    before = authorized.get(f"/api/v1/resources/{resource['id']}").json()["data"]
    error(authorized.get(path(resource)), 404, "SNAPSHOT_NOT_FOUND")

    created = authorized.put(path(resource), json={"content": MARKDOWN})
    assert created.status_code == 201, created.text
    snapshot = created.json()["data"]
    assert snapshot["content"] == MARKDOWN
    assert snapshot["char_count"] == len(MARKDOWN)
    assert snapshot["format"] == "MARKDOWN"
    assert snapshot["extractor"] == "manual"
    assert snapshot["status"] == "READY" and snapshot["failure_code"] is None
    assert snapshot["version"] == 1 and len(snapshot["sha256"]) == 64

    # The whole point: a WEB resource now has frozen text AND still has its link.
    after = authorized.get(f"/api/v1/resources/{resource['id']}").json()["data"]
    assert after == before
    assert after["source_url"] == "https://example.test/article"

    replaced = authorized.put(
        path(resource),
        json={"content": "# 换一版\n\n新的正文。\n", "expected_version": 1},
    )
    assert replaced.status_code == 200, replaced.text
    latest = replaced.json()["data"]
    assert latest["content"] == "# 换一版\n\n新的正文。\n"
    assert latest["version"] == 2 and latest["sha256"] != snapshot["sha256"]
    assert latest["char_count"] == len("# 换一版\n\n新的正文。\n")
    assert authorized.get(path(resource)).json()["data"] == latest
    assert authorized.get(f"/api/v1/resources/{resource['id']}").json()["data"] == before


@pytest.mark.usefixtures("database")
@pytest.mark.parametrize("source", ["WEB", "PASTE", "FILE"])
def test_every_source_type_can_hold_a_snapshot_without_changing_the_resource(
    authorized: TestClient, source: str
) -> None:
    if source == "FILE":
        response = authorized.post(
            "/api/v1/resources",
            data={"source_type": "FILE", "title": "文件资料"},
            files={"file": ("synthetic.txt", b"synthetic original", "text/plain")},
        )
    else:
        response = authorized.post(
            "/api/v1/resources",
            json={"source_type": source, "title": f"{source} 资料"}
            | (
                {"source_url": "https://example.test/x"}
                if source == "WEB"
                else {"pasted_content": "原文"}
            ),
        )
    assert response.status_code == 201, response.text
    resource = response.json()["data"]
    before = authorized.get(f"/api/v1/resources/{resource['id']}").json()["data"]
    assert authorized.put(path(resource), json={"content": MARKDOWN}).status_code == 201
    # The source-exclusivity CHECK on learning_resources is untouched by a snapshot.
    assert authorized.get(f"/api/v1/resources/{resource['id']}").json()["data"] == before


@pytest.mark.usefixtures("database")
def test_deleting_the_snapshot_or_the_resource_leaves_the_other_side_intact(
    authorized: TestClient, session_factory: sessionmaker[Session]
) -> None:
    kept = web(authorized, "保留的资料")
    doomed = web(authorized, "将被删除的资料")
    for item in (kept, doomed):
        assert authorized.put(path(item), json={"content": MARKDOWN}).status_code == 201

    error(authorized.delete(path(kept)), 428, "VERSION_REQUIRED")
    error(
        authorized.delete(path(kept), headers={"If-Match": '"9"'}),
        409,
        "VERSION_CONFLICT",
        {"current_version": 1},
    )
    before = authorized.get(f"/api/v1/resources/{kept['id']}").json()["data"]
    assert authorized.delete(path(kept), headers={"If-Match": '"1"'}).status_code == 204
    # Dropping the snapshot must not touch the resource itself.
    assert authorized.get(f"/api/v1/resources/{kept['id']}").json()["data"] == before
    error(authorized.get(path(kept)), 404, "SNAPSHOT_NOT_FOUND")

    # Deleting a resource cascades to its snapshot and nothing else.
    with session_factory() as session:
        session.execute(delete(LearningResource).where(LearningResource.id == UUID(doomed["id"])))
        session.commit()
        assert session.scalar(select(func.count()).select_from(ContentSnapshot)) == 0


@pytest.mark.usefixtures("database")
def test_snapshot_writes_refuse_bad_input_versions_and_missing_parents(
    authorized: TestClient,
) -> None:
    resource = web(authorized)
    missing = f"/api/v1/resources/{uuid4()}/snapshot"
    error(authorized.get(missing), 404, "RESOURCE_NOT_FOUND")
    error(authorized.put(missing, json={"content": MARKDOWN}), 404, "RESOURCE_NOT_FOUND")
    error(authorized.get("/api/v1/resources/not-a-uuid/snapshot"), 404, "RESOURCE_NOT_FOUND")

    # Replacing something that is not there is a stale belief, not a fresh write.
    error(
        authorized.put(path(resource), json={"content": MARKDOWN, "expected_version": 1}),
        404,
        "SNAPSHOT_NOT_FOUND",
    )
    for invalid in (
        {},
        {"content": ""},
        {"content": "   \n  "},
        {"content": "x" * 1_000_001},
        {"content": MARKDOWN, "format": "HTML"},
        {"content": MARKDOWN, "expected_version": 0},
        {"content": MARKDOWN, "unknown": 1},
        {"content": 5},
    ):
        error(authorized.put(path(resource), json=invalid), 422, "VALIDATION_ERROR")
    assert authorized.put(path(resource), json={"content": MARKDOWN}).status_code == 201
    # An existing snapshot may only be replaced with an explicit version.
    error(authorized.put(path(resource), json={"content": "新"}), 428, "VERSION_REQUIRED")
    error(
        authorized.put(path(resource), json={"content": "新", "expected_version": 7}),
        409,
        "VERSION_CONFLICT",
        {"current_version": 1},
    )
    assert authorized.get(path(resource)).json()["data"]["content"] == MARKDOWN


@pytest.mark.usefixtures("database")
def test_snapshot_commit_failure_rolls_back_and_hides_internals(
    authorized: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    resource = web(authorized)
    marker = "synthetic-private-snapshot-detail"

    def reject(session: Session) -> None:
        raise RuntimeError(marker)

    event.listen(Session, "before_commit", reject)
    try:
        response = authorized.put(path(resource), json={"content": MARKDOWN})
        error(response, 500, "UNKNOWN_ERROR")
        assert marker not in response.text + caplog.text
    finally:
        event.remove(Session, "before_commit", reject)
    error(authorized.get(path(resource)), 404, "SNAPSHOT_NOT_FOUND")


def test_backend_makes_no_outbound_network_calls() -> None:
    """A snapshot is pasted in, never fetched: the backend must stay offline."""
    source = Path(__file__).resolve().parents[1] / "src"
    offenders = [
        path.relative_to(source).as_posix()
        for path in source.rglob("*.py")
        for text in [path.read_text(encoding="utf-8")]
        if any(
            token in text
            for token in ("import httpx", "import requests", "urllib.request", "aiohttp")
        )
    ]
    assert offenders == []
    assert create_app() is not None
