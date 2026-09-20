"""Bibliographic metadata against isolated HTTP/SQLite: what the saved work is."""

from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, event, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from studypilot.infrastructure.database.models import LearningResource, ResourceCitation

CONTEXT = {"sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty"}
FULL: dict[str, Any] = {
    "item_type": "JOURNAL_ARTICLE",
    "authors": ["Hinton, G.", "LeCun, Y.", "Bengio, Y."],
    "issued_year": 2015,
    "issued_date": "2015-05-28",
    "container_title": "Nature",
    "volume": "521",
    "issue": "7553",
    "pages": "436-444",
    "publisher": "Springer Nature",
    "doi": "10.1038/nature14539",
    "isbn": "978-7-111-12345-6",
    "abstract": "合成摘要。仅用于测试。",
}
STORED = FULL | {}


@pytest.fixture
def authorized(client: TestClient) -> TestClient:
    token = client.get("/api/v1/local-session", headers=CONTEXT).json()["data"]["token"]
    client.headers.update(
        {**CONTEXT, "Origin": "http://127.0.0.1:5173", "X-StudyPilot-Token": token}
    )
    return client


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
        json={"source_type": "WEB", "title": title, "source_url": "https://example.test/paper"},
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json()["data"])


def path(resource: dict[str, Any]) -> str:
    return f"/api/v1/resources/{resource['id']}/citation"


def stored(response: Any, status: int = 200) -> dict[str, Any]:
    assert response.status_code == status, response.text
    return cast(dict[str, Any], response.json()["data"])


@pytest.mark.usefixtures("database")
def test_citation_describes_the_work_without_touching_the_resource(
    authorized: TestClient,
) -> None:
    resource = web(authorized)
    before = authorized.get(f"/api/v1/resources/{resource['id']}").json()["data"]
    error(authorized.get(path(resource)), 404, "CITATION_NOT_FOUND")

    citation = stored(authorized.put(path(resource), json=FULL), 201)
    assert set(citation) == {
        "id",
        "resource_id",
        "version",
        "created_at",
        "updated_at",
        *FULL,
    }
    assert {key: citation[key] for key in FULL} == STORED
    assert citation["resource_id"] == resource["id"] and citation["version"] == 1
    assert UUID(citation["id"]).version == 4
    assert datetime.fromisoformat(citation["created_at"]).tzinfo == UTC
    assert authorized.get(path(resource)).json()["data"] == citation

    # The point of a separate table: the resource keeps its own title and address.
    after = authorized.get(f"/api/v1/resources/{resource['id']}").json()["data"]
    assert after == before and after["source_url"] == "https://example.test/paper"


@pytest.mark.usefixtures("database")
def test_writing_again_replaces_the_whole_record_instead_of_merging(
    authorized: TestClient,
) -> None:
    resource = web(authorized)
    assert stored(authorized.put(path(resource), json=FULL), 201)["version"] == 1

    # Only `doi` is sent: every other field must be cleared, not kept from before.
    replaced = stored(
        authorized.put(path(resource), json={"doi": "10.1000/replaced", "expected_version": 1})
    )
    assert replaced["doi"] == "10.1000/replaced" and replaced["version"] == 2
    assert replaced["item_type"] == "OTHER"
    assert all(replaced[field] is None for field in FULL if field not in {"doi", "item_type"}), (
        replaced
    )
    assert authorized.get(path(resource)).json()["data"] == replaced

    # An empty body is a citation with nothing recorded, not a rejected request.
    cleared = stored(authorized.put(path(resource), json={"expected_version": 2}))
    assert cleared["doi"] is None and cleared["item_type"] == "OTHER"
    assert cleared["version"] == 3

    # Rewriting the same values changes nothing, so the version does not move.
    unchanged = stored(authorized.put(path(resource), json={"expected_version": 3}))
    assert unchanged == cleared


@pytest.mark.usefixtures("database")
def test_authors_keep_their_printed_order_and_an_empty_list_means_unfilled(
    authorized: TestClient,
) -> None:
    resource = web(authorized)
    ordered = ["周树人", "Ada Lovelace", "  钱学森  "]
    first = stored(authorized.put(path(resource), json={"authors": ordered}), 201)
    # Order is part of the citation, and surrounding whitespace is not.
    assert first["authors"] == ["周树人", "Ada Lovelace", "钱学森"]

    emptied = stored(authorized.put(path(resource), json={"authors": [], "expected_version": 1}))
    # An empty list is the same fact as "no authors recorded"; it is stored as null
    # so a reader never has to handle two shapes of the same absence.
    assert emptied["authors"] is None and emptied["version"] == 2
    assert authorized.get(path(resource)).json()["data"]["authors"] is None


@pytest.mark.usefixtures("database")
@pytest.mark.parametrize("source", ["WEB", "PASTE", "FILE"])
def test_every_source_type_can_carry_a_citation(authorized: TestClient, source: str) -> None:
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
    assert authorized.put(path(resource), json=FULL).status_code == 201
    assert authorized.get(f"/api/v1/resources/{resource['id']}").json()["data"] == before


@pytest.mark.usefixtures("database")
def test_citation_writes_refuse_bad_input_versions_and_missing_parents(
    authorized: TestClient,
) -> None:
    resource = web(authorized)
    missing = f"/api/v1/resources/{uuid4()}/citation"
    error(authorized.get(missing), 404, "RESOURCE_NOT_FOUND")
    error(authorized.put(missing, json=FULL), 404, "RESOURCE_NOT_FOUND")
    error(
        authorized.delete(missing, headers={"If-Match": '"1"'}),
        404,
        "RESOURCE_NOT_FOUND",
    )
    error(authorized.get("/api/v1/resources/not-a-uuid/citation"), 404, "RESOURCE_NOT_FOUND")

    # Replacing something that is not there is a stale belief, not a fresh write.
    error(
        authorized.put(path(resource), json={"doi": "10.1000/x", "expected_version": 1}),
        404,
        "CITATION_NOT_FOUND",
    )
    for invalid in (
        {"item_type": "ARTICLE"},
        {"item_type": None},
        {"authors": ["ok"] * 101},
        {"authors": ["x" * 201]},
        {"authors": [42]},
        {"authors": [""]},
        {"authors": ["   "]},
        {"authors": "Hinton, G."},
        {"issued_year": 999},
        {"issued_year": 2201},
        {"issued_year": "2015"},
        {"issued_date": "x" * 33},
        {"container_title": "x" * 501},
        {"volume": "x" * 51},
        {"issue": "x" * 51},
        {"pages": "x" * 51},
        {"publisher": "x" * 201},
        {"doi": "x" * 201},
        {"doi": ""},
        {"isbn": "x" * 33},
        {"abstract": "x" * 20_001},
        {"resource_id": str(uuid4())},
        {"unknown": 1},
        {"expected_version": 0},
    ):
        error(authorized.put(path(resource), json=invalid), 422, "VALIDATION_ERROR")
    error(
        authorized.put(path(resource), content=b"{", headers={"content-type": "application/json"}),
        400,
        "MALFORMED_REQUEST",
    )
    error(
        authorized.put(path(resource), content=b"{}", headers={"content-type": "text/plain"}),
        415,
        "CONTENT_TYPE_UNSUPPORTED",
    )
    error(authorized.get(path(resource)), 404, "CITATION_NOT_FOUND")

    assert authorized.put(path(resource), json=FULL).status_code == 201
    # An existing citation may only be replaced with an explicit version.
    error(authorized.put(path(resource), json={"doi": "10.1000/x"}), 428, "VERSION_REQUIRED")
    error(
        authorized.put(path(resource), json={"doi": "10.1000/x", "expected_version": 7}),
        409,
        "VERSION_CONFLICT",
        {"current_version": 1},
    )
    assert authorized.get(path(resource)).json()["data"]["doi"] == FULL["doi"]


@pytest.mark.usefixtures("database")
def test_deleting_the_citation_or_the_resource_leaves_the_other_side_intact(
    authorized: TestClient, session_factory: sessionmaker[Session]
) -> None:
    kept = web(authorized, "保留的资料")
    doomed = web(authorized, "将被删除的资料")
    for item in (kept, doomed):
        assert authorized.put(path(item), json=FULL).status_code == 201

    # A citation belongs to exactly one resource; it is invisible under another.
    across = f"/api/v1/resources/{doomed['id']}/citation"
    assert authorized.get(across).json()["data"]["resource_id"] == doomed["id"]

    error(authorized.delete(path(kept)), 428, "VERSION_REQUIRED")
    error(
        authorized.delete(path(kept), headers={"If-Match": '"' + "9" * 5000 + '"'}),
        428,
        "VERSION_REQUIRED",
    )
    error(
        authorized.delete(path(kept), headers={"If-Match": '"9"'}),
        409,
        "VERSION_CONFLICT",
        {"current_version": 1},
    )
    before = authorized.get(f"/api/v1/resources/{kept['id']}").json()["data"]
    assert authorized.delete(path(kept), headers={"If-Match": '"1"'}).status_code == 204
    # Dropping the citation must not touch the resource itself.
    assert authorized.get(f"/api/v1/resources/{kept['id']}").json()["data"] == before
    error(authorized.get(path(kept)), 404, "CITATION_NOT_FOUND")
    error(authorized.delete(path(kept), headers={"If-Match": '"1"'}), 404, "CITATION_NOT_FOUND")

    with session_factory() as session:
        session.execute(delete(LearningResource).where(LearningResource.id == UUID(doomed["id"])))
        session.commit()
        # Only the deleted resource's citation goes with it.
        assert session.scalar(select(func.count()).select_from(ResourceCitation)) == 0


@pytest.mark.usefixtures("database")
def test_citation_change_invalidates_a_pending_deletion_token(authorized: TestClient) -> None:
    resource = web(authorized)
    preview = authorized.post(f"/api/v1/resources/{resource['id']}/deletion-preview")
    assert preview.status_code == 200, preview.text
    body = preview.json()["data"]
    assert body["impact"]["citation_count"] == 0

    assert authorized.put(path(resource), json=FULL).status_code == 201
    changed = authorized.delete(
        f"/api/v1/resources/{resource['id']}",
        headers={"X-StudyPilot-Deletion-Token": body["confirmation_token"]},
    )
    assert changed.status_code == 409, changed.text
    current = changed.json()["error"]["details"]["current_impact"]
    assert current["impact"]["citation_count"] == 1
    assert current["impact_revision"] != body["impact_revision"]
    assert authorized.get(f"/api/v1/resources/{resource['id']}").status_code == 200


@pytest.mark.usefixtures("database")
def test_citation_commit_failure_rolls_back_and_hides_internals(
    authorized: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    resource = web(authorized)
    marker = "synthetic-private-citation-detail"

    def reject(session: Session) -> None:
        raise RuntimeError(marker)

    event.listen(Session, "before_commit", reject)
    try:
        response = authorized.put(path(resource), json=FULL)
        error(response, 500, "UNKNOWN_ERROR")
        assert marker not in response.text + caplog.text
    finally:
        event.remove(Session, "before_commit", reject)
    error(authorized.get(path(resource)), 404, "CITATION_NOT_FOUND")


@pytest.mark.parametrize(
    "invalid",
    [
        {"item_type": "ARTICLE"},
        {"issued_year": 999},
        {"issued_year": 2201},
        {"issued_date": ""},
        {"container_title": "x" * 501},
        {"volume": ""},
        {"issue": "x" * 51},
        {"pages": ""},
        {"publisher": "x" * 201},
        {"doi": ""},
        {"isbn": "x" * 33},
        {"abstract": ""},
    ],
)
def test_invalid_citation_rows_rejected(
    database: Any, session_factory: sessionmaker[Session], invalid: dict[str, Any]
) -> None:
    factory = session_factory
    with factory.begin() as session:
        parent = LearningResource(title="约束用资料", source_type="PASTE", pasted_content="原文")
        session.add(parent)
        session.flush()
        parent_id = parent.id
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(ResourceCitation(**{"resource_id": parent_id} | invalid))


def test_one_citation_per_resource(database: Any, session_factory: sessionmaker[Session]) -> None:
    with session_factory.begin() as session:
        parent = LearningResource(title="唯一约束", source_type="PASTE", pasted_content="原文")
        session.add(parent)
        session.flush()
        session.add(ResourceCitation(resource_id=parent.id, item_type="BOOK"))
        parent_id = parent.id
    with pytest.raises(IntegrityError), session_factory.begin() as session:
        session.add(ResourceCitation(resource_id=parent_id, item_type="THESIS"))
