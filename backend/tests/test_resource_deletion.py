"""Confirmed resource deletion uses impact preview, tokens and trash isolation."""

from datetime import UTC, date, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session, sessionmaker
from test_files import service
from test_resource_updates import create
from test_resources import CONTEXT

from studypilot.infrastructure.database.models import (
    ActiveReviewPlan,
    DeletionConfirmation,
    LearningProgress,
    LearningResource,
    Note,
    OriginalFile,
    ResourceTag,
    ReviewRecord,
    StudyRecord,
    Tag,
    Topic,
)
from studypilot.modules.resources.files import trash_key

PRIVATE = "synthetic private note body SQL /private/source"


def authorize(client: TestClient) -> TestClient:
    token = client.get("/api/v1/local-session", headers=CONTEXT).json()["data"]["token"]
    client.headers.update(
        {**CONTEXT, "Origin": "http://127.0.0.1:5173", "X-StudyPilot-Token": token}
    )
    return client


@pytest.fixture
def authorized(client: TestClient) -> TestClient:
    return authorize(client)


def error(response: Any, status: int, code: str) -> dict[str, Any]:
    assert response.status_code == status, response.text
    value = response.json()["error"]
    assert set(value) == {"code", "message", "details", "request_id"}
    assert value["code"] == code
    assert value["request_id"] == response.headers["x-request-id"]
    assert response.headers["cache-control"] == "no-store"
    for secret in (PRIVATE, "SQL", "/private/", "synthetic original"):
        assert secret not in response.text
    return cast(dict[str, Any], value)


def preview(client: TestClient, resource_id: str) -> dict[str, Any]:
    response = client.post(f"/api/v1/resources/{resource_id}/deletion-preview")
    assert response.status_code == 200, response.text
    body = cast(dict[str, Any], response.json()["data"])
    assert set(body) == {
        "resource_id",
        "resource_version",
        "impact_revision",
        "expires_at",
        "confirmation_token",
        "impact",
    }
    assert body["resource_id"] == resource_id
    assert len(body["confirmation_token"]) >= 43
    assert len(body["impact_revision"]) == 64
    assert response.headers["cache-control"] == "no-store"
    assert PRIVATE not in response.text
    return body


def add_dependents(session_factory: sessionmaker[Session], resource_id: str) -> tuple[str, str]:
    with session_factory.begin() as session:
        topic = Topic(name="删除保留主题")
        tag = Tag(name="删除保留标签")
        session.add_all([topic, tag])
        session.flush()
        resource = session.get(LearningResource, UUID(resource_id))
        assert resource is not None
        resource.topic_id = topic.id
        session.add(ResourceTag(resource_id=resource.id, tag_id=tag.id))
        session.add(Note(resource_id=resource.id, content=PRIVATE))
        session.add(
            StudyRecord(
                resource_id=resource.id,
                started_at=datetime(2026, 9, 3, 1, tzinfo=UTC),
                duration_seconds=60,
                progress_before=0,
                progress_after=20,
                status_before="UNREAD",
                status_after="IN_PROGRESS",
                summary="synthetic summary",
                questions_next=None,
            )
        )
        session.add(
            ActiveReviewPlan(resource_id=resource.id, status="SCHEDULED", due_date=date(2026, 9, 8))
        )
        session.add(
            ReviewRecord(
                resource_id=resource.id,
                planned_date=date(2026, 9, 8),
                completed_at=datetime(2026, 9, 3, 2, tzinfo=UTC),
                result="UNDERSTOOD",
                notes="synthetic review",
                next_review_date=None,
            )
        )
        return str(topic.id), str(tag.id)


def test_preview_and_delete_cascades_resource_data_but_keeps_taxonomy(
    authorized: TestClient,
    database: Any,
    session_factory: sessionmaker[Session],
) -> None:
    item = create(authorized, "PASTE")
    topic_id, tag_id = add_dependents(session_factory, item["id"])
    body = preview(authorized, item["id"])
    assert body["resource_version"] == 2
    assert body["impact"] == {
        "original_file_count": 0,
        "snapshot_asset_count": 0,
        "note_count": 1,
        "study_record_count": 1,
        "active_review_plan_count": 1,
        "review_record_count": 1,
        "resource_tag_count": 1,
    }
    response = authorized.delete(
        f"/api/v1/resources/{item['id']}",
        headers={"X-StudyPilot-Deletion-Token": body["confirmation_token"]},
    )
    assert response.status_code == 204 and not response.content
    error(authorized.get(f"/api/v1/resources/{item['id']}"), 404, "RESOURCE_NOT_FOUND")
    with session_factory() as session:
        assert session.get(Topic, UUID(topic_id)) is not None
        assert session.get(Tag, UUID(tag_id)) is not None
        for model in (
            LearningResource,
            LearningProgress,
            Note,
            StudyRecord,
            ActiveReviewPlan,
            ReviewRecord,
            ResourceTag,
        ):
            assert session.scalar(select(func.count()).select_from(model)) == 0
        confirmation = session.scalar(select(DeletionConfirmation))
        assert confirmation is not None and confirmation.used_at is not None
        assert confirmation.resource_id == UUID(item["id"])
        assert body["confirmation_token"] not in str(confirmation.impact_manifest)


def test_file_delete_moves_ready_original_to_trash_then_reconcile_discards(
    authorized: TestClient,
    database: Any,
    session_factory: sessionmaker[Session],
    runtime: Any,
) -> None:
    item = create(authorized, "FILE")
    with session_factory() as session:
        original = session.scalar(select(OriginalFile))
        assert original is not None
        storage_key = original.storage_key
        file_id = str(original.id)
    body = preview(authorized, item["id"])
    assert body["impact"]["original_file_count"] == 1
    assert (
        authorized.delete(
            f"/api/v1/resources/{item['id']}",
            headers={"X-StudyPilot-Deletion-Token": body["confirmation_token"]},
        ).status_code
        == 204
    )
    assert not (runtime.files / storage_key).exists()
    assert (runtime.files / trash_key(storage_key)).is_file()
    error(authorized.get(f"/api/v1/files/{file_id}/download"), 404, "FILE_NOT_FOUND")
    service(authorized).reconcile(datetime.now(UTC) + timedelta(hours=25))
    assert not (runtime.files / trash_key(storage_key)).exists()


def test_token_binding_replay_expiry_and_impact_change(
    authorized: TestClient,
    database: Any,
    session_factory: sessionmaker[Session],
) -> None:
    first = create(authorized, "WEB")
    second = create(authorized, "WEB")
    old = preview(authorized, first["id"])
    error(
        authorized.delete(
            f"/api/v1/resources/{second['id']}",
            headers={"X-StudyPilot-Deletion-Token": old["confirmation_token"]},
        ),
        403,
        "DELETION_TOKEN_INVALID",
    )
    assert authorized.post(f"/api/v1/resources/{first['id']}/notes", json={"content": PRIVATE})
    changed = error(
        authorized.delete(
            f"/api/v1/resources/{first['id']}",
            headers={"X-StudyPilot-Deletion-Token": old["confirmation_token"]},
        ),
        409,
        "DELETION_IMPACT_CHANGED",
    )
    current = changed["details"]["current_impact"]
    assert current["resource_id"] == first["id"]
    assert current["impact"]["note_count"] == 1
    assert "confirmation_token" not in str(changed["details"])
    error(
        authorized.delete(
            f"/api/v1/resources/{first['id']}",
            headers={"X-StudyPilot-Deletion-Token": old["confirmation_token"]},
        ),
        409,
        "DELETION_TOKEN_REPLAYED",
    )
    expired = preview(authorized, second["id"])
    with session_factory.begin() as session:
        confirmation = session.scalar(
            select(DeletionConfirmation).where(
                DeletionConfirmation.resource_id == UUID(second["id"])
            )
        )
        assert confirmation is not None
        confirmation.created_at = datetime.now(UTC) - timedelta(minutes=10)
        confirmation.expires_at = datetime.now(UTC) - timedelta(minutes=5)
    error(
        authorized.delete(
            f"/api/v1/resources/{second['id']}",
            headers={"X-StudyPilot-Deletion-Token": expired["confirmation_token"]},
        ),
        410,
        "DELETION_TOKEN_EXPIRED",
    )
    fresh = preview(authorized, first["id"])
    assert (
        authorized.delete(
            f"/api/v1/resources/{first['id']}",
            headers={"X-StudyPilot-Deletion-Token": fresh["confirmation_token"]},
        ).status_code
        == 204
    )


def test_delete_requires_dedicated_token_before_database(
    authorized: TestClient,
    runtime: Any,
) -> None:
    path = f"/api/v1/resources/{uuid4()}"
    error(authorized.delete(path), 403, "DELETION_TOKEN_REQUIRED")
    error(
        authorized.delete(
            path,
            headers=[
                ("X-StudyPilot-Deletion-Token", "a"),
                ("X-StudyPilot-Deletion-Token", "b"),
            ],
        ),
        403,
        "DELETION_TOKEN_INVALID",
    )
    assert not runtime.database.exists()


def test_commit_failure_after_file_quarantine_rolls_back_and_reconciles(
    authorized: TestClient,
    database: Any,
    session_factory: sessionmaker[Session],
    runtime: Any,
) -> None:
    item = create(authorized, "FILE")
    token = preview(authorized, item["id"])["confirmation_token"]
    with session_factory() as session:
        original = session.scalar(select(OriginalFile))
        assert original is not None
        storage_key = original.storage_key

    def fail_delete_commit(session: Session) -> None:
        raise RuntimeError("synthetic private SQL /private/delete")

    event.listen(Session, "before_commit", fail_delete_commit)
    try:
        error(
            authorized.delete(
                f"/api/v1/resources/{item['id']}",
                headers={"X-StudyPilot-Deletion-Token": token},
            ),
            500,
            "UNKNOWN_ERROR",
        )
    finally:
        event.remove(Session, "before_commit", fail_delete_commit)
    assert (runtime.files / trash_key(storage_key)).is_file()
    assert not (runtime.files / storage_key).exists()
    service(authorized).reconcile()
    assert (runtime.files / storage_key).is_file()
    assert authorized.get(f"/api/v1/resources/{item['id']}").status_code == 200


def test_deleting_resource_leaves_standalone_notes(
    authorized: TestClient,
    database: Any,
    session_factory: sessionmaker[Session],
) -> None:
    """A confirmed resource deletion cascades its attached notes but keeps any
    standalone (resource_id NULL) note untouched, and preview counts only attached."""
    item = create(authorized, "PASTE")
    resource_id = UUID(item["id"])
    standalone_id: UUID | None = None
    with session_factory.begin() as session:
        resource = session.get(LearningResource, resource_id)
        assert resource is not None
        session.add(Note(resource_id=resource.id, content=PRIVATE))
        standalone = Note(resource_id=None, content="独立心得保留")
        session.add(standalone)
        session.flush()
        standalone_id = standalone.id

    body = preview(authorized, item["id"])
    assert body["impact"]["note_count"] == 1  # only the attached note

    response = authorized.delete(
        f"/api/v1/resources/{item['id']}",
        headers={"X-StudyPilot-Deletion-Token": body["confirmation_token"]},
    )
    assert response.status_code == 204 and not response.content

    with session_factory() as session:
        assert session.get(LearningResource, resource_id) is None
        remaining = session.scalar(select(Note).where(Note.id == standalone_id))
        assert remaining is not None
        assert remaining.resource_id is None and remaining.content == "独立心得保留"
        assert session.scalar(select(func.count()).select_from(Note)) == 1
