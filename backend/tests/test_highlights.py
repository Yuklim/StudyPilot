"""Reading highlights against isolated HTTP/SQLite: the anchor is what is stored.

A highlight records what the reader marked (`exact` with its surrounding
context) and keeps offsets only as a fallback. The backend never checks the
passage against the snapshot text - re-locating belongs to the reader - so these
tests pin the storage contract: preconditions, the note binding, versioned
writes, reading order, and what a resource deletion takes with it.
"""

from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

CONTEXT = {"sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty"}
MARKDOWN = "# 神经网络\n\n神经网络主要由输入层、隐藏层、输出层构成。\n\n第二段。\n"
PRIVATE = "private synthetic note"


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
    for secret in [PRIVATE, "SQL", "Traceback", "/private/"]:
        assert secret not in response.text


def web(client: TestClient, title: str = "网页资料") -> dict[str, Any]:
    response = client.post(
        "/api/v1/resources",
        json={"source_type": "WEB", "title": title, "source_url": "https://example.test/article"},
    )
    assert response.status_code == 201, response.text
    return dict(response.json()["data"])


def readable(client: TestClient, title: str = "网页资料") -> dict[str, Any]:
    """A resource with frozen text, which is what a highlight can be made on."""
    resource = web(client, title)
    saved = client.put(f"/api/v1/resources/{resource['id']}/snapshot", json={"content": MARKDOWN})
    assert saved.status_code == 201, saved.text
    return resource


def path(resource: dict[str, Any], highlight: dict[str, Any] | None = None) -> str:
    base = f"/api/v1/resources/{resource['id']}/highlights"
    return base + (f"/{highlight['id']}" if highlight else "")


def anchor(**overrides: Any) -> dict[str, Any]:
    return {
        "exact": "输入层、隐藏层、输出层",
        "prefix": "神经网络主要由",
        "suffix": "构成。",
        "start_offset": 16,
        "end_offset": 27,
    } | overrides


def add(client: TestClient, resource: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    response = client.post(path(resource), json=anchor(**overrides))
    assert response.status_code == 201, response.text
    return dict(response.json()["data"])


def note(client: TestClient, resource: dict[str, Any], content: str = PRIVATE) -> dict[str, Any]:
    response = client.post(f"/api/v1/resources/{resource['id']}/notes", json={"content": content})
    assert response.status_code == 201, response.text
    return dict(response.json()["data"])


@pytest.mark.usefixtures("database")
def test_a_highlight_keeps_its_anchor_and_stands_without_a_note(authorized: TestClient) -> None:
    resource = readable(authorized)
    created = add(authorized, resource)
    assert created["exact"] == "输入层、隐藏层、输出层"
    assert created["prefix"] == "神经网络主要由" and created["suffix"] == "构成。"
    assert created["start_offset"] == 16 and created["end_offset"] == 27
    # The user's decision (2026-09-19): marking a passage does not require writing
    # anything about it.
    assert created["note_id"] is None
    assert created["resource_id"] == resource["id"] and created["version"] == 1
    assert set(created) == {
        "id",
        "resource_id",
        "exact",
        "prefix",
        "suffix",
        "start_offset",
        "end_offset",
        "note_id",
        "version",
        "created_at",
        "updated_at",
    }

    detail = authorized.get(path(resource, created)).json()["data"]
    assert detail == created
    # Context is optional: a passage at the very start of the text has no prefix.
    bare = add(authorized, resource, prefix=None, suffix=None, start_offset=0, end_offset=5)
    assert bare["prefix"] is None and bare["suffix"] is None


@pytest.mark.usefixtures("database")
def test_highlights_need_text_to_point_at(authorized: TestClient) -> None:
    missing = {"id": str(uuid4())}
    error(authorized.post(path(missing), json=anchor()), 404, "RESOURCE_NOT_FOUND")
    # A resource with no snapshot has nothing to anchor into yet.
    without = web(authorized, "还没有正文")
    error(authorized.post(path(without), json=anchor()), 404, "SNAPSHOT_NOT_FOUND")
    # Listing is allowed without a snapshot (empty), only writing needs one.
    empty = authorized.get(path(without)).json()
    assert empty["data"] == [] and empty["page"]["total_items"] == 0


@pytest.mark.usefixtures("database")
def test_anchor_bounds_are_enforced(authorized: TestClient) -> None:
    resource = readable(authorized)
    for bad in [
        anchor(exact=""),
        anchor(exact="长" * 2001),
        anchor(prefix="前" * 201),
        anchor(suffix="后" * 201),
        anchor(start_offset=-1),
        anchor(start_offset=27, end_offset=27),
        anchor(start_offset=30, end_offset=27),
        anchor(start_offset="16"),
        anchor() | {"colour": "yellow"},
    ]:
        error(authorized.post(path(resource), json=bad), 422, "VALIDATION_ERROR")
    # The ceilings themselves are accepted.
    assert authorized.post(path(resource), json=anchor(exact="长" * 2000)).status_code == 201
    assert authorized.post(path(resource), json=anchor(prefix="前" * 200)).status_code == 201


@pytest.mark.usefixtures("database")
def test_a_note_can_be_bound_rebound_and_released(authorized: TestClient) -> None:
    resource = readable(authorized)
    first, second = note(authorized, resource), note(authorized, resource, "另一条心得")
    created = add(authorized, resource, note_id=first["id"])
    assert created["note_id"] == first["id"]

    # Rebinding is a versioned write; the anchor is untouched by it.
    moved = authorized.patch(
        path(resource, created), json={"note_id": second["id"], "expected_version": 1}
    )
    assert moved.status_code == 200, moved.text
    body = moved.json()["data"]
    assert body["note_id"] == second["id"] and body["version"] == 2
    assert body["exact"] == created["exact"] and body["start_offset"] == created["start_offset"]

    # Releasing keeps the highlight: the passage was marked, whatever was written.
    freed = authorized.patch(path(resource, body), json={"note_id": None, "expected_version": 2})
    assert freed.status_code == 200 and freed.json()["data"]["note_id"] is None

    # Stale and missing versions are refused the usual way.
    error(
        authorized.patch(path(resource, body), json={"note_id": None, "expected_version": 2}),
        409,
        "VERSION_CONFLICT",
        {"current_version": 3},
    )
    error(authorized.patch(path(resource, body), json={"note_id": None}), 428, "VERSION_REQUIRED")
    # The anchor cannot be edited through PATCH at all.
    error(
        authorized.patch(path(resource, body), json={"exact": "换一段", "expected_version": 3}),
        422,
        "VALIDATION_ERROR",
    )


@pytest.mark.usefixtures("database")
def test_a_note_belongs_to_this_resource_and_to_one_highlight(authorized: TestClient) -> None:
    resource, other = readable(authorized), readable(authorized, "另一份资料")
    mine, elsewhere = note(authorized, resource), note(authorized, other, "别处的心得")
    standalone = authorized.post("/api/v1/notes", json={"content": "独立心得"})
    assert standalone.status_code == 201

    error(
        authorized.post(path(resource), json=anchor(note_id=elsewhere["id"])),
        404,
        "NOTE_NOT_FOUND",
    )
    error(
        authorized.post(path(resource), json=anchor(note_id=standalone.json()["data"]["id"])),
        404,
        "NOTE_NOT_FOUND",
    )
    error(authorized.post(path(resource), json=anchor(note_id=str(uuid4()))), 404, "NOTE_NOT_FOUND")

    taken = add(authorized, resource, note_id=mine["id"])
    second = add(authorized, resource, start_offset=40, end_offset=45)
    error(
        authorized.patch(
            path(resource, second), json={"note_id": mine["id"], "expected_version": 1}
        ),
        409,
        "NOTE_ALREADY_HIGHLIGHTED",
    )
    # Rebinding a highlight to the note it already holds is not a conflict with itself.
    same = authorized.patch(
        path(resource, taken), json={"note_id": mine["id"], "expected_version": 1}
    )
    assert same.status_code == 200 and same.json()["data"]["note_id"] == mine["id"]


@pytest.mark.usefixtures("database")
def test_deleting_the_note_keeps_the_passage_that_was_marked(authorized: TestClient) -> None:
    resource = readable(authorized)
    written = note(authorized, resource)
    created = add(authorized, resource, note_id=written["id"])
    removed = authorized.delete(
        f"/api/v1/resources/{resource['id']}/notes/{written['id']}",
        headers={"If-Match": f'"{written["version"]}"'},
    )
    assert removed.status_code == 204
    kept = authorized.get(path(resource, created)).json()["data"]
    assert kept["note_id"] is None and kept["exact"] == created["exact"]


@pytest.mark.usefixtures("database")
def test_highlights_are_listed_in_reading_order_and_paged(authorized: TestClient) -> None:
    resource = readable(authorized)
    # Created out of order on purpose: the list must read like the article.
    middle = add(authorized, resource, exact="中间", start_offset=50, end_offset=52)
    first = add(authorized, resource, exact="开头", start_offset=1, end_offset=3)
    last = add(authorized, resource, exact="结尾", start_offset=90, end_offset=92)

    page = authorized.get(path(resource)).json()
    assert [row["id"] for row in page["data"]] == [first["id"], middle["id"], last["id"]]
    assert page["page"]["total_items"] == 3 and page["page"]["has_more"] is False

    newest = authorized.get(path(resource), params={"sort": "-created_at"}).json()
    assert [row["id"] for row in newest["data"]] == [last["id"], first["id"], middle["id"]]

    paged = authorized.get(path(resource), params={"page_size": 2}).json()
    assert [row["id"] for row in paged["data"]] == [first["id"], middle["id"]]
    assert paged["page"]["has_more"] is True and paged["page"]["total_pages"] == 2
    beyond = authorized.get(path(resource), params={"page": 9, "page_size": 2}).json()
    assert beyond["data"] == [] and beyond["page"]["has_more"] is False

    error(authorized.get(path(resource) + "?sort=exact"), 422, "VALIDATION_ERROR")
    error(authorized.get(path(resource) + "?q=中间"), 422, "VALIDATION_ERROR")
    error(authorized.get(path(resource) + "?page_size=101"), 422, "VALIDATION_ERROR")


@pytest.mark.usefixtures("database")
def test_highlights_never_cross_resources_and_delete_by_version(authorized: TestClient) -> None:
    resource, other = readable(authorized), readable(authorized, "另一份资料")
    created = add(authorized, resource)
    # Another resource's collection does not contain it, by id or in its list.
    error(authorized.get(path(other, created)), 404, "HIGHLIGHT_NOT_FOUND")
    assert authorized.get(path(other)).json()["data"] == []
    error(authorized.get(path(resource, {"id": str(uuid4())})), 404, "HIGHLIGHT_NOT_FOUND")
    error(authorized.get(path(resource, {"id": "not-a-uuid"})), 404, "HIGHLIGHT_NOT_FOUND")

    error(authorized.delete(path(resource, created)), 428, "VERSION_REQUIRED")
    error(
        authorized.delete(path(resource, created), headers={"If-Match": '"9"'}),
        409,
        "VERSION_CONFLICT",
        {"current_version": 1},
    )
    gone = authorized.delete(path(resource, created), headers={"If-Match": '"1"'})
    assert gone.status_code == 204 and not gone.content
    error(authorized.get(path(resource, created)), 404, "HIGHLIGHT_NOT_FOUND")
