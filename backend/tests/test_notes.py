"""Personal-note lifecycle, version protection and failures in isolated SQLite."""

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from threading import Barrier
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session, sessionmaker
from starlette.requests import Request
from support import RuntimePaths, resource

from studypilot.infrastructure.database.models import LearningProgress, Note, OriginalFile
from studypilot.infrastructure.database.note_store import NoteStore
from studypilot.main import create_app
from studypilot.modules.notes.contracts import NoteCreate, NotePatch

CONTEXT = {"sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty"}
PRIVATE = "private synthetic note"


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
            "title": "合成笔记资料",
            "pasted_content": "original synthetic text",
        },
    )
    assert response.status_code == 201
    return dict(response.json()["data"])


def path(item: dict[str, Any], note: dict[str, Any] | None = None) -> str:
    return f"/api/v1/resources/{item['id']}/notes" + (f"/{note['id']}" if note else "")


def add(client: TestClient, item: dict[str, Any], content: str = PRIVATE) -> dict[str, Any]:
    response = client.post(path(item), json={"content": content})
    assert response.status_code == 201, response.text
    return dict(response.json()["data"])


def error(response: Any, status: int, code: str, details: dict[str, int] | None = None) -> None:
    assert response.status_code == status, response.text
    payload = response.json()["error"]
    assert set(payload) == {"code", "message", "details", "request_id"}
    assert payload["code"] == code and payload["details"] == (details or {})
    assert payload["request_id"] == response.headers["x-request-id"]
    assert response.headers["cache-control"] == "no-store"
    for secret in [PRIVATE, "original synthetic text", "SQL", "Traceback", "/private/"]:
        assert secret not in response.text


def test_lifecycle_versions_noop_and_resource_isolation(
    authorized: TestClient,
    item: dict[str, Any],
) -> None:
    original = authorized.get("/api/v1/resources/" + item["id"]).json()
    text = PRIVATE + "\n<script>not executed</script>\n  内部空白保留"
    note = add(authorized, item, " \n" + text + "\t")
    second = add(authorized, item)
    assert note["content"] == text and note["version"] == 1
    assert UUID(note["resource_id"]) == UUID(item["id"])
    for field in ["created_at", "updated_at"]:
        assert note[field].endswith("Z")
        datetime.fromisoformat(note[field])
    assert authorized.get(path(item, note)).json() == {"data": note}
    assert authorized.get(path(item)).json()["page"]["total_items"] == 2
    same = authorized.patch(path(item, note), json={"expected_version": 1, "content": text + " \n"})
    assert same.status_code == 200 and same.json()["data"] == note
    updated = authorized.patch(
        path(item, note), json={"expected_version": 1, "content": "new understanding"}
    )
    assert updated.status_code == 200
    current = updated.json()["data"]
    assert current["version"] == 2 and current["created_at"] == note["created_at"]
    assert current["updated_at"] > note["updated_at"]
    error(
        authorized.patch(path(item, note), json={"expected_version": 1, "content": PRIVATE}),
        409,
        "VERSION_CONFLICT",
        {"current_version": 2},
    )
    error(
        authorized.delete(path(item, note), headers={"If-Match": '"1"'}),
        409,
        "VERSION_CONFLICT",
        {"current_version": 2},
    )
    assert authorized.get(path(item, note)).json()["data"] == current
    deleted = authorized.delete(path(item, note), headers={"If-Match": '"2"'})
    assert deleted.status_code == 204 and deleted.content == b""
    error(authorized.get(path(item, note)), 404, "NOTE_NOT_FOUND")
    error(authorized.delete(path(item, note), headers={"If-Match": '"2"'}), 404, "NOTE_NOT_FOUND")
    assert authorized.get(path(item)).json()["data"] == [second]
    assert authorized.get("/api/v1/resources/" + item["id"]).json() == original
    assert authorized.get("/api/v1/resources", params={"q": PRIVATE}).json()["data"] == []
    assert authorized.get(f"/api/v1/resources/{item['id']}/study-records").json()["data"] == []


@pytest.mark.parametrize("value", [None, "", " \t\n", 1, True, [], {}, "x" * 50001])
def test_invalid_content_and_no_side_effect(
    authorized: TestClient,
    item: dict[str, Any],
    value: Any,
) -> None:
    error(authorized.post(path(item), json={"content": value}), 422, "VALIDATION_ERROR")
    assert authorized.get(path(item)).json()["data"] == []
    note = add(authorized, item)
    error(
        authorized.patch(path(item, note), json={"content": value, "expected_version": 1}),
        422,
        "VALIDATION_ERROR",
    )
    assert authorized.get(path(item, note)).json()["data"] == note


def test_content_boundary_and_immutable_fields(
    authorized: TestClient, item: dict[str, Any]
) -> None:
    note = add(authorized, item, " 文" * 25000)
    assert len(note["content"]) == 49999
    maximum = add(authorized, item, "文" * 50000)
    assert len(maximum["content"]) == 50000
    for field in ["id", "resource_id", "version", "created_at", "ai_content"]:
        error(
            authorized.post(path(item), json={"content": PRIVATE, field: str(uuid4())}),
            422,
            "VALIDATION_ERROR",
        )
        error(
            authorized.patch(
                path(item, note),
                json={
                    "content": PRIVATE,
                    "expected_version": 1,
                    field: str(uuid4()),
                },
            ),
            422,
            "VALIDATION_ERROR",
        )
    error(authorized.post(path(item), json={}), 422, "VALIDATION_ERROR")
    error(authorized.patch(path(item, note), json={"expected_version": 1}), 422, "VALIDATION_ERROR")
    error(authorized.patch(path(item, note), json={"content": PRIVATE}), 428, "VERSION_REQUIRED")
    for invalid in [None, 0, -1, 1.5, "1", True]:
        error(
            authorized.patch(
                path(item, note), json={"content": PRIVATE, "expected_version": invalid}
            ),
            422,
            "VALIDATION_ERROR",
        )


@pytest.mark.parametrize("value", [None, "1", 'W/"1"', "*", '"0"', '"01"', '"-1"', '"1","2"'])
def test_delete_requires_single_strong_version(
    authorized: TestClient,
    item: dict[str, Any],
    value: str | None,
) -> None:
    note = add(authorized, item)
    error(
        authorized.delete(
            path(item, note), headers={"If-Match": value} if value is not None else {}
        ),
        428,
        "VERSION_REQUIRED",
    )
    assert authorized.get(path(item, note)).json()["data"] == note


def test_duplicate_version_header_rejected(authorized: TestClient, item: dict[str, Any]) -> None:
    note = add(authorized, item)
    error(
        authorized.delete(path(item, note), headers=[("If-Match", '"1"'), ("If-Match", '"1"')]),
        428,
        "VERSION_REQUIRED",
    )


@pytest.mark.parametrize(
    "query",
    [
        "page=0",
        "page=-1",
        "page=1.5",
        "page=",
        "page=true",
        "page_size=101",
        "page_size=0",
        "page_size=",
        "sort=content",
        "sort=",
        "q=private",
        "resource_id=wrong",
        "page=1&page=2",
    ],
)
def test_invalid_queries(authorized: TestClient, item: dict[str, Any], query: str) -> None:
    error(authorized.get(path(item) + "?" + query), 422, "VALIDATION_ERROR")


def test_pagination_ties_and_parent_boundary(
    authorized: TestClient,
    item: dict[str, Any],
    session_factory: sessionmaker[Session],
) -> None:
    assert authorized.get(path(item)).json()["page"] == {
        "number": 1,
        "size": 20,
        "total_items": 0,
        "total_pages": 0,
        "has_more": False,
    }
    stamp = datetime(2026, 9, 1, tzinfo=UTC)
    with session_factory.begin() as session:
        other = resource(session)
        for i in range(1, 23):
            session.add(
                Note(
                    id=UUID(int=i),
                    resource_id=UUID(item["id"]),
                    content=f"合成笔记 {i}",
                    created_at=stamp,
                    updated_at=stamp,
                )
            )
        session.add(Note(resource_id=other.id, content="other parent"))
        other_id = other.id
    for order in ["created_at", "-created_at", "updated_at", "-updated_at"]:
        first = authorized.get(path(item), params={"sort": order}).json()
        second = authorized.get(path(item), params={"sort": order, "page": 2}).json()
        assert first["page"]["total_items"] == 22 and first["page"]["has_more"] is True
        assert [row["id"] for row in first["data"] + second["data"]] == [
            str(UUID(int=i)) for i in range(1, 23)
        ]
        assert second["page"]["has_more"] is False
    assert authorized.get(path(item), params={"page": 3}).json()["data"] == []
    assert len(authorized.get(path(item), params={"page_size": 100}).json()["data"]) == 22
    # Same valid note ID under a different valid resource must not disclose or mutate it.
    wrong = f"/api/v1/resources/{other_id}/notes/{UUID(int=1)}"
    for response in [
        authorized.get(wrong),
        authorized.patch(wrong, json={"content": PRIVATE, "expected_version": 1}),
        authorized.delete(wrong, headers={"If-Match": '"1"'}),
    ]:
        error(response, 404, "NOTE_NOT_FOUND")
    with session_factory() as session:
        assert session.get(Note, UUID(int=1)).content == "合成笔记 1"  # type: ignore[union-attr]


@pytest.mark.parametrize("state", ["missing", "PENDING", "FAILED", "READY"])
def test_file_visibility_and_archive(
    authorized: TestClient,
    session_factory: sessionmaker[Session],
    state: str,
) -> None:
    with session_factory.begin() as session:
        parent = resource(session, source_type="FILE", source_url=None)
        session.add(
            LearningProgress(
                resource_id=parent.id,
                status="ARCHIVED",
                archived_from_status="UNREAD",
                progress_percent=0,
            )
        )
        existing = Note(resource_id=parent.id, content=PRIVATE)
        session.add(existing)
        if state != "missing":
            session.add(
                OriginalFile(
                    resource_id=parent.id,
                    original_name="synthetic.txt",
                    size_bytes=1,
                    media_type="text/plain; charset=utf-8",
                    sha256="a" * 64,
                    storage_key=f"{parent.id}/original",
                    status=state,
                    failure_code="FILE_CORRUPTED" if state == "FAILED" else None,
                )
            )
        session.flush()
        parent_id, note_id = parent.id, existing.id
    item = {"id": str(parent_id)}
    detail = path(item, {"id": str(note_id)})
    responses = [
        authorized.get(path(item)),
        authorized.get(detail),
        authorized.post(path(item), json={"content": "another note"}),
        authorized.patch(detail, json={"content": "changed", "expected_version": 1}),
        authorized.delete(detail, headers={"If-Match": '"2"'}),
    ]
    if state == "READY":
        assert [r.status_code for r in responses] == [200, 200, 201, 200, 204]
    else:
        for response in responses:
            error(response, 404, "RESOURCE_NOT_FOUND")
        with session_factory() as session:
            assert session.get(Note, note_id).content == PRIVATE  # type: ignore[union-attr]


@pytest.mark.parametrize("stage", ["after_flush_postexec", "before_commit"])
@pytest.mark.parametrize("action", ["create", "update", "delete"])
def test_transaction_failure_rolls_back_without_replay(
    authorized: TestClient,
    item: dict[str, Any],
    stage: str,
    action: str,
) -> None:
    note = add(authorized, item)
    calls = 0

    def fail(*args: Any) -> None:
        nonlocal calls
        calls += 1
        raise RuntimeError(PRIVATE + " SQL /private/path")

    event.listen(Session, stage, fail)
    try:
        if action == "create":
            response = authorized.post(path(item), json={"content": "must roll back"})
        elif action == "update":
            response = authorized.patch(
                path(item, note), json={"content": "must roll back", "expected_version": 1}
            )
        else:
            response = authorized.delete(path(item, note), headers={"If-Match": '"1"'})
    finally:
        event.remove(Session, stage, fail)
    error(response, 500, "UNKNOWN_ERROR")
    assert calls == 1
    assert authorized.get(path(item)).json()["data"] == [note]


@pytest.mark.parametrize("action", ["update", "delete"])
def test_actual_orm_stale_write_is_classified_without_replay(
    authorized: TestClient,
    item: dict[str, Any],
    session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
    action: str,
) -> None:
    note = add(authorized, item)
    with session_factory() as session:
        stale = session.get(Note, UUID(note["id"]))
        assert stale is not None
        session.expunge(stale)
    changed = authorized.patch(
        path(item, note), json={"content": "newer note", "expected_version": 1}
    ).json()["data"]
    original_find = NoteStore.find
    calls = 0

    def stale_find(self: NoteStore, rid: UUID, nid: UUID) -> Note:
        nonlocal calls
        calls += 1
        if calls == 1:
            self.session.add(stale)
            return stale
        return original_find(self, rid, nid)

    with monkeypatch.context() as patch:
        patch.setattr(NoteStore, "find", stale_find)
        response = (
            authorized.patch(
                path(item, note), json={"content": "stale replacement", "expected_version": 1}
            )
            if action == "update"
            else authorized.delete(path(item, note), headers={"If-Match": '"1"'})
        )
    error(response, 409, "VERSION_CONFLICT", {"current_version": 2})
    assert calls == 2  # one failed mutation and one read-only classification
    assert authorized.get(path(item, note)).json()["data"] == changed


@pytest.mark.parametrize("second_action", ["update", "delete"])
def test_real_competing_transactions_do_not_overwrite_or_delete_newer_content(
    authorized: TestClient,
    item: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    second_action: str,
) -> None:
    note = add(authorized, item)
    barrier = Barrier(2, timeout=5)
    original = NoteStore.check_version

    def synchronize(record: Note, expected: int) -> None:
        original(record, expected)
        barrier.wait()

    def write(index: int) -> Any:
        with TestClient(create_app(), base_url="http://127.0.0.1:8000") as client:
            authorize(client)
            if index == 1 and second_action == "delete":
                return client.delete(path(item, note), headers={"If-Match": '"1"'})
            return client.patch(
                path(item, note), json={"content": f"winner {index}", "expected_version": 1}
            )

    with monkeypatch.context() as patch:
        patch.setattr(NoteStore, "check_version", staticmethod(synchronize))
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(write, [0, 1]))
    winners = [r for r in responses if r.status_code in {200, 204}]
    assert len(winners) == 1
    loser = next(r for r in responses if r not in winners)
    assert loser.status_code in {409, 500}
    error(
        loser,
        loser.status_code,
        "VERSION_CONFLICT" if loser.status_code == 409 else "UNKNOWN_ERROR",
        {"current_version": 2} if loser.status_code == 409 else {},
    )
    if winners[0].status_code == 204:
        error(authorized.get(path(item, note)), 404, "NOTE_NOT_FOUND")
    else:
        assert authorized.get(path(item, note)).json() == winners[0].json()
        assert winners[0].json()["data"]["version"] == 2


def test_security_precedes_body_database_and_validation(
    authorized: TestClient,
    runtime: RuntimePaths,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    base = path({"id": str(uuid4())})
    for raw in [b"{", b'{"content":NaN}', b'{"content":Infinity}']:
        error(
            authorized.post(base, content=raw, headers={"Content-Type": "application/json"}),
            400,
            "MALFORMED_REQUEST",
        )
    error(
        authorized.post(base, content=PRIVATE, headers={"Content-Type": "text/plain"}),
        415,
        "CONTENT_TYPE_UNSUPPORTED",
    )
    assert not runtime.database.exists()
    reads = 0

    async def forbidden_body(self: Request) -> bytes:
        nonlocal reads
        reads += 1
        raise AssertionError("body must not be read")

    monkeypatch.setattr(Request, "body", forbidden_body)
    for method, url in [
        ("GET", base),
        ("GET", base + "/" + str(uuid4())),
        ("POST", base),
        ("PATCH", base + "/" + str(uuid4())),
        ("DELETE", base + "/" + str(uuid4())),
    ]:
        error(
            authorized.request(method, url, content=PRIVATE, headers={"X-StudyPilot-Token": ""}),
            403,
            "LOCAL_TOKEN_INVALID",
        )
        if method != "GET":
            error(
                authorized.request(
                    method, url, content=PRIVATE, headers={"Origin": "https://untrusted.test"}
                ),
                403,
                "REQUEST_ORIGIN_FORBIDDEN",
            )
    assert reads == 0 and not runtime.database.exists()
    del authorized.headers["X-StudyPilot-Token"]
    error(authorized.get(base), 403, "LOCAL_TOKEN_REQUIRED")


def test_missing_parents_ids_and_contract_shapes(
    authorized: TestClient, item: dict[str, Any]
) -> None:
    note = add(authorized, item)
    for resource_id in ["invalid", str(uuid4())]:
        error(authorized.get(path({"id": resource_id})), 404, "RESOURCE_NOT_FOUND")
    for note_id in ["invalid", str(uuid4())]:
        error(authorized.get(path(item, {"id": note_id})), 404, "NOTE_NOT_FOUND")
    document = json.loads(
        (Path(__file__).resolve().parents[2] / "docs/contracts/openapi-v1.json").read_text()
    )
    schemas = document["components"]["schemas"]
    for value, schema in [
        (note, "Note"),
        ({"data": note}, "NoteEnvelope"),
        (authorized.get(path(item)).json(), "NotePage"),
    ]:
        assert set(value) == set(schemas[schema]["properties"]) == set(schemas[schema]["required"])
    models: tuple[type[NoteCreate], ...] = (NoteCreate, NotePatch)
    for model in models:
        schema = schemas[model.__name__]
        assert set(model.model_fields) == set(schema["properties"])
        assert {name for name, field in model.model_fields.items() if field.is_required()} == set(
            schema["required"]
        )
    assert {
        "listResourceNotes",
        "createResourceNote",
        "getResourceNote",
        "updateResourceNote",
        "deleteResourceNote",
    } <= set(document["x-delivery-profile"]["available_operations"])
