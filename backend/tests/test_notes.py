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
from studypilot.modules.notes.contracts import NoteAttach, NoteCreate, NoteDetach, NotePatch

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
    models: tuple[type[NoteCreate], type[NotePatch], type[NoteAttach], type[NoteDetach]] = (
        NoteCreate,
        NotePatch,
        NoteAttach,
        NoteDetach,
    )
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
        "attachNote",
        "detachNote",
    } <= set(document["x-delivery-profile"]["available_operations"])


def standalone_path(note: dict[str, Any] | None = None) -> str:
    return "/api/v1/notes" + (f"/{note['id']}" if note else "")


def add_standalone(client: TestClient, content: str = PRIVATE) -> dict[str, Any]:
    response = client.post(standalone_path(), json={"content": content})
    assert response.status_code == 201, response.text
    return dict(response.json()["data"])


def test_standalone_lifecycle_pagination_and_version(database: Any, authorized: TestClient) -> None:
    """Top-level /notes manages notes with no resource, independently of any item."""
    created = add_standalone(authorized, "第一条独立心得")
    row = created
    assert row["resource_id"] is None
    assert row["content"] == "第一条独立心得" and row["version"] == 1

    # Detail round-trip.
    detail = authorized.get(standalone_path(created)).json()["data"]
    assert detail == created

    # Standalone notes are isolated from the per-resource listing.
    page = authorized.get(standalone_path() + "?page=1&page_size=20").json()
    assert [n["id"] for n in page["data"]] == [created["id"]]
    assert page["page"]["total_items"] == 1 and page["page"]["has_more"] is False

    # No-op edit keeps version/time.
    before = authorized.get(standalone_path(created)).json()["data"]
    noop = authorized.patch(
        standalone_path(created),
        json={"content": created["content"], "expected_version": created["version"]},
    )
    assert noop.status_code == 200
    assert noop.json()["data"]["version"] == before["version"]

    # Real edit bumps version and content.
    changed = authorized.patch(
        standalone_path(created),
        json={"content": "修改后的独立心得", "expected_version": created["version"]},
    )
    assert changed.status_code == 200
    assert changed.json()["data"]["content"] == "修改后的独立心得"
    assert changed.json()["data"]["version"] == created["version"] + 1

    # Wrong version conflicts; does not overwrite.
    conflict = authorized.patch(
        standalone_path(created),
        json={"content": "试图覆盖", "expected_version": created["version"]},
    )
    error(conflict, 409, "VERSION_CONFLICT", {"current_version": created["version"] + 1})

    # Delete with version header.
    removed = authorized.delete(
        standalone_path(created), headers={"If-Match": f'"{created["version"] + 1}"'}
    )
    assert removed.status_code == 204
    gone = authorized.get(standalone_path(created))
    error(gone, 404, "NOTE_NOT_FOUND")


def test_standalone_not_attached_and_resource_notes_remain_separate(
    authorized: TestClient, item: dict[str, Any]
) -> None:
    """An attached note under a resource and a standalone note never cross lists."""
    attached = add(authorized, item, "绑定心得")
    standalone = add_standalone(authorized, "独立心得")

    resource_page = authorized.get(path(item) + "?page=1").json()
    assert [n["id"] for n in resource_page["data"]] == [attached["id"]]

    standalone_page = authorized.get(standalone_path() + "?page=1").json()
    assert [n["id"] for n in standalone_page["data"]] == [standalone["id"]]

    # A standalone id is not reachable under a resource, and vice versa.
    error(authorized.get(path(item, standalone)), 404, "NOTE_NOT_FOUND")
    error(authorized.get(standalone_path(attached)), 404, "NOTE_NOT_FOUND")


def test_standalone_pagination_empty_and_bounds(database: Any, authorized: TestClient) -> None:
    empty = authorized.get(standalone_path() + "?page=1&page_size=20").json()
    assert empty["data"] == [] and empty["page"]["total_items"] == 0

    created: list[dict[str, Any]] = []
    for index in range(3):
        created.append(add_standalone(authorized, f"心得 {index}"))

    first = authorized.get(standalone_path() + "?page=1&page_size=2").json()
    assert [n["content"] for n in first["data"]] == ["心得 2", "心得 1"]
    assert first["page"]["total_items"] == 3 and first["page"]["has_more"] is True

    second = authorized.get(standalone_path() + "?page=2&page_size=2").json()
    assert [n["content"] for n in second["data"]] == ["心得 0"]
    assert second["page"]["has_more"] is False

    # Unknown page is empty, not an error.
    beyond = authorized.get(standalone_path() + "?page=9&page_size=2").json()
    assert beyond["data"] == [] and beyond["page"]["has_more"] is False


def test_standalone_content_validation_and_missing_ids(
    database: Any, authorized: TestClient
) -> None:
    # Empty / whitespace-only content is rejected.
    for bad in ["", "   "]:
        response = authorized.post(standalone_path(), json={"content": bad})
        error(response, 422, "VALIDATION_ERROR")
    # Non-note id under the top-level collection is 404.
    error(authorized.get(standalone_path({"id": str(uuid4())})), 404, "NOTE_NOT_FOUND")
    # Malformed note id is 404 too.
    error(authorized.get("/api/v1/notes/not-a-uuid"), 404, "NOTE_NOT_FOUND")


def attach_url(note: dict[str, Any]) -> str:
    return standalone_path(note) + "/attach"


def test_attach_moves_a_standalone_note_into_a_resource(
    authorized: TestClient, item: dict[str, Any]
) -> None:
    note = add_standalone(authorized, "待后贴到资料")
    assert note["resource_id"] is None and note["version"] == 1
    url = attach_url(note)
    # Guards: missing version, wrong version, missing/bad resource, extra field, media type.
    error(authorized.post(url, json={"resource_id": item["id"]}), 428, "VERSION_REQUIRED")
    error(
        authorized.post(url, json={"resource_id": item["id"], "expected_version": 2}),
        409,
        "VERSION_CONFLICT",
        {"current_version": 1},
    )
    error(authorized.post(url, json={"expected_version": 1}), 422, "VALIDATION_ERROR")
    error(
        authorized.post(url, json={"resource_id": "not-a-uuid", "expected_version": 1}),
        422,
        "VALIDATION_ERROR",
    )
    error(
        authorized.post(
            url,
            json={"resource_id": item["id"], "expected_version": 1, "content": PRIVATE},
        ),
        422,
        "VALIDATION_ERROR",
    )
    error(
        authorized.post(url, content=PRIVATE, headers={"Content-Type": "text/plain"}),
        415,
        "CONTENT_TYPE_UNSUPPORTED",
    )
    # Success: binds to the resource; version+1 and updated_at move; content unchanged.
    moved = authorized.post(url, json={"resource_id": item["id"], "expected_version": 1})
    assert moved.status_code == 200, moved.text
    data = moved.json()["data"]
    assert data["id"] == note["id"]
    assert data["resource_id"] == item["id"]
    assert data["version"] == 2
    assert data["content"] == note["content"]
    assert data["created_at"] == note["created_at"]
    assert data["updated_at"] > note["updated_at"]
    # The note left the standalone collection and appears under the resource.
    assert authorized.get(standalone_path() + "?page=1").json()["data"] == []
    assert [n["id"] for n in authorized.get(path(item) + "?page=1").json()["data"]] == [note["id"]]
    error(authorized.get(standalone_path(note)), 404, "NOTE_NOT_FOUND")
    assert authorized.get(path(item, note)).status_code == 200
    # A second attach is a scope error: the note is no longer standalone.
    error(
        authorized.post(url, json={"resource_id": item["id"], "expected_version": 2}),
        404,
        "NOTE_NOT_FOUND",
    )


def test_attach_rejects_unreadable_or_missing_resources(
    authorized: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    note = add_standalone(authorized)
    # A random id is not a readable resource.
    error(
        authorized.post(
            attach_url(note), json={"resource_id": str(uuid4()), "expected_version": 1}
        ),
        404,
        "RESOURCE_NOT_FOUND",
    )
    # A FILE resource without a READY original is not readable.
    with session_factory.begin() as session:
        file_resource = resource(session, source_type="FILE", source_url=None)
        file_id = str(file_resource.id)
    error(
        authorized.post(attach_url(note), json={"resource_id": file_id, "expected_version": 1}),
        404,
        "RESOURCE_NOT_FOUND",
    )
    # The note is untouched after both refusals.
    assert authorized.get(standalone_path(note)).json()["data"] == note


def detach_url(item: dict[str, Any], note: dict[str, Any]) -> str:
    return path(item, note) + "/detach"


def test_detach_moves_a_bound_note_back_to_standalone(
    authorized: TestClient, item: dict[str, Any]
) -> None:
    bound = add(authorized, item, "待解除的心得")
    url = detach_url(item, bound)
    # Guards mirror attach: missing version, wrong version, extra field, media type.
    error(authorized.post(url, json={}), 428, "VERSION_REQUIRED")
    error(
        authorized.post(url, json={"expected_version": 2}),
        409,
        "VERSION_CONFLICT",
        {"current_version": 1},
    )
    error(
        authorized.post(url, json={"expected_version": 1, "content": PRIVATE}),
        422,
        "VALIDATION_ERROR",
    )
    error(
        authorized.post(url, content=PRIVATE, headers={"Content-Type": "text/plain"}),
        415,
        "CONTENT_TYPE_UNSUPPORTED",
    )
    # Wrong scope: detaching under a different readable resource is NOTE_NOT_FOUND.
    other = authorized.post(
        "/api/v1/resources",
        json={"source_type": "PASTE", "title": "other", "pasted_content": "other text"},
    ).json()["data"]
    error(
        authorized.post(detach_url(other, bound), json={"expected_version": 1}),
        404,
        "NOTE_NOT_FOUND",
    )
    # Success: back to standalone; version+1, content unchanged.
    released = authorized.post(url, json={"expected_version": 1})
    assert released.status_code == 200, released.text
    data = released.json()["data"]
    assert data["id"] == bound["id"]
    assert data["resource_id"] is None
    assert data["version"] == 2
    assert data["content"] == bound["content"]
    assert data["created_at"] == bound["created_at"]
    assert authorized.get(path(item)).json()["data"] == []
    assert [n["id"] for n in authorized.get(standalone_path() + "?page=1").json()["data"]] == [
        bound["id"]
    ]
    error(authorized.get(path(item, bound)), 404, "NOTE_NOT_FOUND")
    assert authorized.get(standalone_path(bound)).status_code == 200
    # A second detach of the now-standalone note (still under the resource path) is 404.
    error(
        authorized.post(detach_url(item, bound), json={"expected_version": 2}),
        404,
        "NOTE_NOT_FOUND",
    )


@pytest.mark.parametrize("stage", ["after_flush_postexec", "before_commit"])
@pytest.mark.parametrize("move", ["attach", "detach"])
def test_scope_move_failure_rolls_back_without_replay(
    authorized: TestClient,
    item: dict[str, Any],
    stage: str,
    move: str,
) -> None:
    if move == "attach":
        note = add_standalone(authorized, PRIVATE)
        url = attach_url(note)
        body = {"resource_id": item["id"], "expected_version": 1}
    else:
        note = add(authorized, item, PRIVATE)
        url = detach_url(item, note)
        body = {"expected_version": 1}
    calls = 0

    def fail(*args: Any) -> None:
        nonlocal calls
        calls += 1
        raise RuntimeError(PRIVATE + " SQL /private/path")

    event.listen(Session, stage, fail)
    try:
        response = authorized.post(url, json=body)
    finally:
        event.remove(Session, stage, fail)
    error(response, 500, "UNKNOWN_ERROR")
    assert calls == 1
    # The note stayed in its original scope after the rollback.
    if move == "attach":
        assert authorized.get(standalone_path(note)).json()["data"] == note
        assert authorized.get(path(item)).json()["data"] == []
    else:
        assert authorized.get(path(item, note)).json()["data"] == note


@pytest.mark.parametrize("move", ["attach", "detach"])
def test_real_competing_scope_moves_have_a_single_winner(
    authorized: TestClient,
    item: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    move: str,
) -> None:
    if move == "attach":
        note = add_standalone(authorized, "并发后贴")
        url = attach_url(note)
        body: dict[str, Any] = {"resource_id": item["id"], "expected_version": 1}
    else:
        note = add(authorized, item, "并发解除")
        url = detach_url(item, note)
        body = {"expected_version": 1}
    barrier = Barrier(2, timeout=5)
    original = NoteStore.check_version

    def synchronize(record: Note, expected: int) -> None:
        original(record, expected)
        barrier.wait()

    def write(_index: int) -> Any:
        with TestClient(create_app(), base_url="http://127.0.0.1:8000") as client:
            authorize(client)
            return client.post(url, json=body)

    with monkeypatch.context() as patch:
        patch.setattr(NoteStore, "check_version", staticmethod(synchronize))
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(write, [0, 1]))
    winners = [r for r in responses if r.status_code == 200]
    assert len(winners) == 1
    loser = next(r for r in responses if r is not winners[0])
    assert loser.status_code in {404, 409, 500}
    data = winners[0].json()["data"]
    assert data["id"] == note["id"]
    assert data["version"] == 2
    assert data["content"] == note["content"]
    if move == "attach":
        assert data["resource_id"] == item["id"]
        error(authorized.get(standalone_path(note)), 404, "NOTE_NOT_FOUND")
    else:
        assert data["resource_id"] is None
        error(authorized.get(path(item, note)), 404, "NOTE_NOT_FOUND")
