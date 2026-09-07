"""Frozen snapshot images: bytes on disk, recognized from bytes, swept with the text.

Every case runs against a real SQLite file and a real controlled directory, so the
assertions are about files that exist, not about calls that were made.
"""

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker
from support import RuntimePaths
from test_files import service

from studypilot.infrastructure.database.models import SnapshotAsset
from studypilot.modules.resources.files import trash_key

CONTEXT = {"sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty"}
MARKDOWN = "# 标题\n\n![图](https://example.test/a.png)\n"

# Minimal byte sequences that are what they claim to be at the signature level.
PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + bytes(24)
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF" + bytes(16) + b"\xff\xd9"
GIF = b"GIF89a" + bytes(20)
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + bytes(24)
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


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


def web(client: TestClient, title: str = "网页资料") -> dict[str, Any]:
    response = client.post(
        "/api/v1/resources",
        json={"source_type": "WEB", "title": title, "source_url": "https://example.test/article"},
    )
    assert response.status_code == 201, response.text
    return dict(response.json()["data"])


def path(resource: dict[str, Any]) -> str:
    return f"/api/v1/resources/{resource['id']}/snapshot"


def frozen(client: TestClient, title: str = "网页资料") -> dict[str, Any]:
    """A resource that already has frozen text, which is what an asset hangs off."""

    resource = web(client, title)
    response = client.put(path(resource), json={"content": MARKDOWN})
    assert response.status_code == 201, response.text
    return resource


def upload(
    client: TestClient,
    resource: dict[str, Any],
    data: bytes = PNG,
    source_url: str = "https://example.test/a.png",
    version: int = 1,
    media: str = "image/png",
) -> Any:
    return client.post(
        f"{path(resource)}/assets",
        files={"file": ("ignored-name", data, media)},
        data={"source_url": source_url},
        headers={"If-Match": f'"{version}"'},
    )


def area(runtime: RuntimePaths, name: str) -> list[Path]:
    directory = runtime.files / name
    return sorted(directory.iterdir()) if directory.is_dir() else []


def stored(runtime: RuntimePaths) -> list[Path]:
    return [item for name in ("staging", "objects", "trash") for item in area(runtime, name)]


@pytest.mark.usefixtures("database")
def test_upload_returns_metadata_without_the_storage_key_and_serves_the_bytes_back(
    authorized: TestClient, runtime: RuntimePaths
) -> None:
    resource = frozen(authorized)
    response = upload(authorized, resource)
    assert response.status_code == 201, response.text
    asset = response.json()["data"]
    assert set(asset) == {
        "id",
        "snapshot_id",
        "source_url",
        "media_type",
        "size_bytes",
        "sha256",
        "created_at",
    }
    assert asset["media_type"] == "image/png"
    assert asset["size_bytes"] == len(PNG)
    assert asset["source_url"] == "https://example.test/a.png"
    assert "storage_key" not in response.text and "objects/" not in response.text

    listing = authorized.get(f"{path(resource)}/assets")
    assert listing.status_code == 200
    assert listing.json()["data"] == [asset]

    bytes_response = authorized.get(f"{path(resource)}/assets/{asset['id']}/bytes")
    assert bytes_response.status_code == 200
    assert bytes_response.content == PNG
    assert bytes_response.headers["content-type"] == "image/png"
    assert bytes_response.headers["x-content-type-options"] == "nosniff"
    assert bytes_response.headers["cache-control"] == "private, no-store"
    assert len(area(runtime, "objects")) == 1 and area(runtime, "staging") == []


@pytest.mark.usefixtures("database")
@pytest.mark.parametrize(
    ("data", "expected"),
    [(PNG, "image/png"), (JPEG, "image/jpeg"), (GIF, "image/gif"), (WEBP, "image/webp")],
)
def test_the_four_frozen_formats_are_recognized_from_their_bytes(
    authorized: TestClient, data: bytes, expected: str
) -> None:
    resource = frozen(authorized)
    response = upload(authorized, resource, data=data, media="application/octet-stream")
    assert response.status_code == 201, response.text
    assert response.json()["data"]["media_type"] == expected


@pytest.mark.usefixtures("database")
def test_the_declared_content_type_never_decides_the_format(authorized: TestClient) -> None:
    resource = frozen(authorized)
    # A page can declare anything. PNG bytes announced as SVG are still a PNG,
    # and SVG bytes announced as PNG are still refused.
    accepted = upload(authorized, resource, data=PNG, media="image/svg+xml")
    assert accepted.status_code == 201, accepted.text
    assert accepted.json()["data"]["media_type"] == "image/png"


@pytest.mark.usefixtures("database")
@pytest.mark.parametrize(
    "data",
    [SVG, b"<!doctype html><html><body>page</body></html>", b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n"],
)
def test_non_images_are_refused_and_leave_no_bytes_behind(
    authorized: TestClient, runtime: RuntimePaths, data: bytes
) -> None:
    resource = frozen(authorized)
    error(upload(authorized, resource, data=data, media="image/png"), 415, "ASSET_TYPE_UNSUPPORTED")
    assert stored(runtime) == []
    assert authorized.get(f"{path(resource)}/assets").json()["data"] == []


@pytest.mark.usefixtures("database")
def test_one_image_over_ten_mebibytes_is_refused(
    authorized: TestClient, runtime: RuntimePaths
) -> None:
    resource = frozen(authorized)
    oversize = PNG + bytes(10 * 1024 * 1024)
    error(upload(authorized, resource, data=oversize), 413, "ASSET_TOO_LARGE")
    assert stored(runtime) == []
    # Just under the ceiling still goes through, so the limit is the limit and not
    # an accidental refusal of large-but-allowed images.
    fitting = PNG + bytes(10 * 1024 * 1024 - len(PNG) - 1)
    assert upload(authorized, resource, data=fitting).status_code == 201


@pytest.mark.usefixtures("database")
def test_the_snapshot_version_is_a_precondition_that_never_advances(
    authorized: TestClient, runtime: RuntimePaths
) -> None:
    resource = frozen(authorized)
    missing = authorized.post(
        f"{path(resource)}/assets",
        files={"file": ("ignored-name", PNG, "image/png")},
        data={"source_url": "https://example.test/a.png"},
    )
    error(missing, 428, "VERSION_REQUIRED")
    error(upload(authorized, resource, version=7), 409, "VERSION_CONFLICT", {"current_version": 1})
    # A refused precondition is decided before the body is read: nothing is staged.
    assert stored(runtime) == []

    assert upload(authorized, resource).status_code == 201
    snapshot = authorized.get(path(resource)).json()["data"]
    assert snapshot["version"] == 1, "an asset sits beside the text, it does not change it"


@pytest.mark.usefixtures("database")
def test_the_same_address_twice_is_one_row_and_one_copy(
    authorized: TestClient, runtime: RuntimePaths, session_factory: sessionmaker[Session]
) -> None:
    resource = frozen(authorized)
    first = upload(authorized, resource).json()["data"]
    second = upload(authorized, resource)
    assert second.status_code == 201
    assert second.json()["data"] == first
    assert len(area(runtime, "objects")) == 1
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(SnapshotAsset)) == 1


@pytest.mark.usefixtures("database")
def test_source_url_must_be_an_absolute_web_address(authorized: TestClient) -> None:
    resource = frozen(authorized)
    error(upload(authorized, resource, source_url="/a.png"), 422, "VALIDATION_ERROR")
    error(upload(authorized, resource, source_url="javascript:alert(1)"), 422, "VALIDATION_ERROR")


@pytest.mark.usefixtures("database")
def test_an_asset_id_from_another_resource_reveals_nothing(authorized: TestClient) -> None:
    mine = frozen(authorized, "我的资料")
    other = frozen(authorized, "别人的资料")
    asset = upload(authorized, other).json()["data"]
    error(
        authorized.get(f"{path(mine)}/assets/{asset['id']}/bytes"),
        404,
        "SNAPSHOT_ASSET_NOT_FOUND",
    )
    error(authorized.get(f"{path(mine)}/assets/{uuid4()}/bytes"), 404, "SNAPSHOT_ASSET_NOT_FOUND")


@pytest.mark.usefixtures("database")
def test_missing_resource_and_missing_snapshot_keep_the_existing_wording(
    authorized: TestClient,
) -> None:
    absent = {"id": str(uuid4())}
    error(authorized.get(f"{path(absent)}/assets"), 404, "RESOURCE_NOT_FOUND")
    without_text = web(authorized, "还没冻结正文")
    error(authorized.get(f"{path(without_text)}/assets"), 404, "SNAPSHOT_NOT_FOUND")
    error(upload(authorized, without_text), 404, "SNAPSHOT_NOT_FOUND")


@pytest.mark.usefixtures("database")
def test_deleting_one_asset_isolates_its_bytes(
    authorized: TestClient, runtime: RuntimePaths
) -> None:
    resource = frozen(authorized)
    asset = upload(authorized, resource).json()["data"]
    kept = upload(authorized, resource, source_url="https://example.test/b.png").json()["data"]

    response = authorized.delete(
        f"{path(resource)}/assets/{asset['id']}", headers={"If-Match": '"1"'}
    )
    assert response.status_code == 204, response.text
    assert [row["id"] for row in authorized.get(f"{path(resource)}/assets").json()["data"]] == [
        kept["id"]
    ]
    assert len(area(runtime, "trash")) == 1 and len(area(runtime, "objects")) == 1
    error(
        authorized.get(f"{path(resource)}/assets/{asset['id']}/bytes"),
        404,
        "SNAPSHOT_ASSET_NOT_FOUND",
    )


@pytest.mark.usefixtures("database")
def test_replacing_the_text_discards_the_images_it_belonged_to(
    authorized: TestClient, runtime: RuntimePaths
) -> None:
    resource = frozen(authorized)
    for index in range(3):
        added = upload(authorized, resource, source_url=f"https://example.test/{index}.png")
        assert added.status_code == 201, added.text
    assert len(area(runtime, "objects")) == 3

    replaced = authorized.put(path(resource), json={"content": "# 新正文\n", "expected_version": 1})
    assert replaced.status_code == 200, replaced.text
    assert authorized.get(f"{path(resource)}/assets").json()["data"] == []
    assert area(runtime, "objects") == [] and len(area(runtime, "trash")) == 3


@pytest.mark.usefixtures("database")
def test_a_refused_replacement_leaves_the_images_alone(
    authorized: TestClient, runtime: RuntimePaths
) -> None:
    resource = frozen(authorized)
    asset = upload(authorized, resource).json()["data"]
    error(
        authorized.put(path(resource), json={"content": "# 新正文\n", "expected_version": 9}),
        409,
        "VERSION_CONFLICT",
        {"current_version": 1},
    )
    assert [row["id"] for row in authorized.get(f"{path(resource)}/assets").json()["data"]] == [
        asset["id"]
    ]
    assert len(area(runtime, "objects")) == 1 and area(runtime, "trash") == []


@pytest.mark.usefixtures("database")
def test_deleting_the_snapshot_isolates_every_image(
    authorized: TestClient, runtime: RuntimePaths
) -> None:
    resource = frozen(authorized)
    upload(authorized, resource)
    upload(authorized, resource, source_url="https://example.test/b.png")

    response = authorized.delete(path(resource), headers={"If-Match": '"1"'})
    assert response.status_code == 204, response.text
    error(authorized.get(f"{path(resource)}/assets"), 404, "SNAPSHOT_NOT_FOUND")
    assert area(runtime, "objects") == [] and len(area(runtime, "trash")) == 2


@pytest.mark.usefixtures("database")
def test_deleting_the_resource_counts_and_isolates_its_images(
    authorized: TestClient, runtime: RuntimePaths
) -> None:
    resource = frozen(authorized)
    upload(authorized, resource)

    preview = authorized.post(f"/api/v1/resources/{resource['id']}/deletion-preview")
    assert preview.status_code == 200, preview.text
    body = preview.json()["data"]
    assert body["impact"]["snapshot_asset_count"] == 1

    # A second image changes the manifest, so the token taken before it is stale.
    upload(authorized, resource, source_url="https://example.test/b.png")
    stale = authorized.delete(
        f"/api/v1/resources/{resource['id']}",
        headers={
            "If-Match": f'"{body["resource_version"]}"',
            "X-StudyPilot-Deletion-Token": body["confirmation_token"],
        },
    )
    assert stale.status_code == 409, stale.text
    assert len(area(runtime, "objects")) == 2

    fresh = authorized.post(f"/api/v1/resources/{resource['id']}/deletion-preview").json()["data"]
    assert fresh["impact"]["snapshot_asset_count"] == 2
    removed = authorized.delete(
        f"/api/v1/resources/{resource['id']}",
        headers={
            "If-Match": f'"{fresh["resource_version"]}"',
            "X-StudyPilot-Deletion-Token": fresh["confirmation_token"],
        },
    )
    assert removed.status_code == 204, removed.text
    assert area(runtime, "objects") == [] and len(area(runtime, "trash")) == 2


@pytest.mark.usefixtures("database")
def test_the_orphan_sweep_keeps_referenced_images_and_collects_released_ones(
    authorized: TestClient, runtime: RuntimePaths
) -> None:
    resource = frozen(authorized)
    asset = upload(authorized, resource).json()["data"]
    [object_path] = area(runtime, "objects")

    # Far enough ahead that every file on disk is older than the grace period.
    later = datetime.now(UTC) + timedelta(hours=25)
    service(authorized).reconcile(later)
    assert object_path.exists(), "a referenced asset must survive the sweep"
    assert authorized.get(f"{path(resource)}/assets/{asset['id']}/bytes").content == PNG

    authorized.delete(f"{path(resource)}/assets/{asset['id']}", headers={"If-Match": '"1"'})
    [trashed] = area(runtime, "trash")
    assert trashed.name == trash_key(f"objects/{object_path.name}").split("/")[1]
    service(authorized).reconcile(later)
    assert not trashed.exists(), "once the row is gone the bytes are collectable"


@pytest.mark.usefixtures("database")
def test_the_bytes_endpoint_is_unusable_as_an_image_source(authorized: TestClient) -> None:
    """An `<img src>` cannot reach this endpoint, and that is the gate working.

    A browser's image request differs from a fetch in exactly two ways, and each one
    is refused on its own: it declares `sec-fetch-dest: image`, and it carries no
    process token. Callers hold the token, fetch the bytes and hand over a blob.
    """

    resource = frozen(authorized)
    asset = upload(authorized, resource).json()["data"]
    target = f"{path(resource)}/assets/{asset['id']}/bytes"

    as_image = authorized.get(target, headers={"sec-fetch-dest": "image"})
    assert as_image.status_code == 403, as_image.text
    assert as_image.json()["error"]["code"] == "REQUEST_ORIGIN_FORBIDDEN"

    del authorized.headers["X-StudyPilot-Token"]
    untokened = authorized.get(target, headers={"sec-fetch-dest": "image"})
    assert untokened.status_code == 403
    assert untokened.json()["error"]["code"] == "LOCAL_TOKEN_REQUIRED"


@pytest.mark.usefixtures("database")
def test_an_upload_in_progress_is_not_swept_from_under_itself(
    authorized: TestClient, runtime: RuntimePaths
) -> None:
    """Staging goes through the file service so the sweep knows it is in use."""

    files = service(authorized)
    key, stream = files.begin()
    stream.write(PNG)
    stream.close()
    [staged] = area(runtime, "staging")

    later = datetime.now(UTC) + timedelta(hours=25)
    files.reconcile(later)
    assert staged.exists(), "an active staging key is off limits to the sweep"

    files.release(key)
    assert not staged.exists()
