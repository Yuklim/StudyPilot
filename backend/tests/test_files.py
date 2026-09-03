"""Temporary-store file API and fault recovery tests; no user data is touched."""

import asyncio
import hashlib
import os
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from file_fixtures import doc, docx, pdf
from sqlalchemy import Engine, event, func, select
from sqlalchemy.orm import Session
from support import RuntimePaths
from test_resources import CONTEXT, assert_error
from test_resources import authorized as authorized

from studypilot.api.file_upload import Upload
from studypilot.application.files import FileService
from studypilot.infrastructure.config import get_settings
from studypilot.infrastructure.database import create_session_factory
from studypilot.infrastructure.database.file_store import FileRepository
from studypilot.infrastructure.database.models import (
    LearningProgress,
    LearningResource,
    OriginalFile,
)
from studypilot.infrastructure.files.storage import LocalFileStorage
from studypilot.main import create_app
from studypilot.modules.resources.contracts import FileCreate, ResourceError
from studypilot.modules.resources.files import MAX_FILE_BYTES, trash_key


def service(client: TestClient) -> FileService:
    result: FileService = client.app.state.files  # type: ignore[attr-defined]
    return result


def upload(
    client: TestClient,
    data: bytes = b"synthetic\n",
    name: str = "notes.txt",
    media: str = "text/plain",
    fields: dict[str, Any] | None = None,
) -> Any:
    return client.post(
        "/api/v1/resources",
        data={"source_type": "FILE", "title": "合成资料", **(fields or {})},
        files={"file": (name, data, media)},
    )


@pytest.mark.usefixtures("database")
@pytest.mark.parametrize(
    "name,body,media",
    [
        ("笔记.TXT", "原件\n".encode(), "text/plain"),
        ("notes.markdown", b"# title\n", "text/markdown"),
        ("notes.md", b"# title\n", "application/octet-stream"),
        ("sample.pdf", pdf(), "application/pdf"),
        (
            "sample.docx",
            docx(),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
        ("sample.doc", doc(), "application/msword"),
    ],
    ids=["utf8-txt", "markdown-long", "markdown", "pdf", "docx", "doc"],
)
def test_upload_read_download(
    authorized: TestClient, runtime: RuntimePaths, name: str, body: bytes, media: str
) -> None:
    response = upload(authorized, body, name, media)
    assert response.status_code == 201, response.text
    item = response.json()["data"]
    original = item["original_file"]
    assert original["status"] == "READY"
    assert original["sha256"] == hashlib.sha256(body).hexdigest()
    assert original["size_bytes"] == len(body)
    assert item["progress"]["status"] == "UNREAD" and item["progress"]["progress_percent"] == 0
    assert item["source_type"] == "FILE"
    assert "staging_key" not in response.text and "storage_key" not in response.text
    assert str(runtime.root) not in response.text
    read = authorized.get(f"/api/v1/resources/{item['id']}")
    assert read.json()["data"] == item
    assert (
        authorized.get("/api/v1/resources?source_type=FILE").json()["data"][0]["id"] == item["id"]
    )
    result = authorized.get(f"/api/v1/files/{original['id']}/download")
    assert result.status_code == 200 and result.content == body
    assert result.headers["content-type"] == original["media_type"]
    assert result.headers["cache-control"] == "private, no-store"
    assert result.headers["x-content-type-options"] == "nosniff"
    disposition = result.headers["content-disposition"]
    assert disposition.startswith("attachment; filename=\"original-file\"; filename*=UTF-8''")
    assert all(ord(c) < 128 for c in disposition)
    assert not list((runtime.files / "staging").iterdir())
    assert len(list((runtime.files / "objects").iterdir())) == 1


@pytest.mark.parametrize(
    "name,data,media,code,status",
    [
        ("empty.txt", b"", "text/plain", "VALIDATION_ERROR", 422),
        ("bad.txt", b"\xff", "text/plain", "FILE_TYPE_UNSUPPORTED", 415),
        ("nul.md", b"text\0", "text/markdown", "FILE_TYPE_UNSUPPORTED", 415),
        ("sample.pdf", b"%PDF-1.7\n%%EOF", "application/pdf", "FILE_TYPE_UNSUPPORTED", 415),
        (
            "sample.doc",
            b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",
            "application/msword",
            "FILE_TYPE_UNSUPPORTED",
            415,
        ),
        ("sample.docx", b"PK\x03\x04", "application/octet-stream", "FILE_TYPE_UNSUPPORTED", 415),
        (
            "sample.docx",
            docx({"../escape": b"x"}),
            "application/octet-stream",
            "FILE_TYPE_UNSUPPORTED",
            415,
        ),
        ("notes.txt", b"text", "application/pdf", "FILE_TYPE_UNSUPPORTED", 415),
        ("notes.exe.txt", b"text", "text/plain", "FILE_TYPE_UNSUPPORTED", 415),
        ("notes.pdf.txt", b"text", "text/plain", "FILE_TYPE_UNSUPPORTED", 415),
        ("notes.html", b"text", "text/html", "FILE_TYPE_UNSUPPORTED", 415),
    ],
    ids=[
        "empty",
        "non-utf8",
        "nul",
        "pdf-incomplete",
        "doc-incomplete",
        "zip-incomplete",
        "zip-traversal",
        "mime-conflict",
        "executable-disguise",
        "format-disguise",
        "html",
    ],
)
def test_invalid_file_no_database(
    authorized: TestClient,
    runtime: RuntimePaths,
    name: str,
    data: bytes,
    media: str,
    code: str,
    status: int,
) -> None:
    assert_error(upload(authorized, data, name, media), status, code)
    assert not runtime.database.exists()
    assert not list(runtime.files.rglob("*")) or not list(runtime.files.rglob("?" * 32))


@pytest.mark.usefixtures("database")
def test_ready_commit_failure_and_post_commit_response_failure(
    authorized: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    svc = service(authorized)

    def fail_ready(session: Session) -> None:
        if any(isinstance(row, OriginalFile) and row.status == "READY" for row in session.dirty):
            raise RuntimeError("synthetic ready commit failure")

    event.listen(Session, "before_commit", fail_ready)
    try:
        assert_error(upload(authorized), 500, "UNKNOWN_ERROR")
    finally:
        event.remove(Session, "before_commit", fail_ready)
    row = svc.repository.records()[0]
    assert row.status == "PENDING" and svc.storage.exists(row.storage_key)
    svc.reconcile()
    assert svc.repository.get(row.id).status == "READY"
    with monkeypatch.context() as patch:

        def fail_detail(*args: Any) -> Any:
            raise RuntimeError("synthetic response failure")

        patch.setattr(svc.repository, "detail", fail_detail)
        assert_error(upload(authorized), 500, "UNKNOWN_ERROR")
    # An ambiguous response is not auto-retried and must not erase a committed original.
    assert all(row.status == "READY" for row in svc.repository.records())
    assert len(svc.repository.records()) == 2


def test_flush_failure_no_registration(
    authorized: TestClient, runtime: RuntimePaths, monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken_sync(descriptor: int) -> None:
        raise OSError("synthetic private path")

    monkeypatch.setattr(os, "fsync", broken_sync)
    result = upload(authorized)
    assert_error(result, 503, "STORAGE_PATH_UNAVAILABLE")
    assert "synthetic private" not in result.text and not runtime.database.exists()


@pytest.mark.usefixtures("database")
@pytest.mark.parametrize("area", ["staging", "objects", "trash"])
def test_all_managed_orphans_have_grace(
    authorized: TestClient, runtime: RuntimePaths, area: str
) -> None:
    svc = service(authorized)
    directory = runtime.files / area
    directory.mkdir(exist_ok=True)
    key = f"{area}/{uuid4().hex}"
    path = runtime.files / key
    path.write_bytes(b"synthetic orphan")
    now = datetime.now(UTC)
    age = (now - timedelta(hours=23, minutes=59)).timestamp()
    os.utime(path, (age, age))
    svc.reconcile(now)
    assert path.exists()
    svc.reconcile(now + timedelta(minutes=2))
    assert not path.exists()


@pytest.mark.usefixtures("database")
def test_final_symlink_cannot_read_outside(authorized: TestClient, runtime: RuntimePaths) -> None:
    item = upload(authorized).json()["data"]["original_file"]
    svc = service(authorized)
    row = svc.repository.get(UUID(item["id"]))
    path = runtime.files / row.storage_key
    path.unlink()
    outside = runtime.root / "outside.txt"
    outside.write_bytes(b"outside synthetic content")
    path.symlink_to(outside)
    result = authorized.get(f"/api/v1/files/{row.id}/download")
    assert_error(result, 503, "STORAGE_PATH_UNAVAILABLE")
    assert outside.read_bytes() == b"outside synthetic content"
    assert "outside" not in result.text


@pytest.mark.usefixtures("database")
def test_failed_never_revives_and_corrupt_reconciliation(
    authorized: TestClient, runtime: RuntimePaths
) -> None:
    item = upload(authorized).json()["data"]["original_file"]
    svc = service(authorized)
    row = svc.repository.get(UUID(item["id"]))
    (runtime.files / row.storage_key).write_bytes(b"corrupt")
    svc.reconcile()
    assert svc.repository.get(row.id).status == "FAILED"
    with pytest.raises(ResourceError, match="FILE_STATE_UNAVAILABLE"):
        svc.repository.ready(row.id, lambda _: None)
    svc.reconcile()
    assert svc.repository.get(row.id).status == "FAILED"


@pytest.mark.usefixtures("database")
def test_size_limit_and_path_name(authorized: TestClient, runtime: RuntimePaths) -> None:
    assert_error(upload(authorized, b"x" * (MAX_FILE_BYTES + 1)), 413, "FILE_TOO_LARGE")
    result = upload(authorized, b"x" * MAX_FILE_BYTES, "../../folder\\notes.txt")
    assert result.status_code == 201
    assert result.json()["data"]["original_file"]["original_name"] == "notes.txt"
    keys = [p.name for p in (runtime.files / "objects").iterdir()]
    assert len(keys) == 1 and len(keys[0]) == 32 and "notes" not in keys[0]


@pytest.mark.parametrize(
    "fields",
    [
        {"title": ""},
        {"source_type": "WEB"},
        {"source_url": "https://example.test"},
        {"pasted_content": "no"},
        {"unknown": "x"},
        {"topic_id": "bad"},
        {"tag_ids": [str(uuid4())] * 2},
    ],
)
def test_invalid_form_metadata(
    authorized: TestClient, runtime: RuntimePaths, fields: dict[str, Any]
) -> None:
    assert_error(upload(authorized, fields=fields), 422, "VALIDATION_ERROR")
    assert not runtime.database.exists()
    assert not list(runtime.files.rglob("?" * 32))


@pytest.mark.usefixtures("database")
def test_taxonomy_atomic_and_initial_progress(authorized: TestClient, database: Engine) -> None:
    topic = authorized.post("/api/v1/topics", json={"name": "合成主题"}).json()["data"]
    tag = authorized.post("/api/v1/tags", json={"name": "合成标签"}).json()["data"]
    result = upload(authorized, fields={"topic_id": topic["id"], "tag_ids": [tag["id"]]})
    assert result.status_code == 201
    item = result.json()["data"]
    assert item["topic_id"] == topic["id"] and item["tags"][0]["id"] == tag["id"]
    assert_error(upload(authorized, fields={"topic_id": str(uuid4())}), 404, "TOPIC_NOT_FOUND")
    assert_error(upload(authorized, fields={"tag_ids": [str(uuid4())]}), 404, "TAG_NOT_FOUND")
    with create_session_factory(database)() as session:
        for model in (LearningResource, LearningProgress, OriginalFile):
            assert session.scalar(select(func.count()).select_from(model)) == 1


def test_malformed_multipart_and_duplicate_fields(
    authorized: TestClient, runtime: RuntimePaths
) -> None:
    for content_type, body, code, status in [
        ("multipart/form-data", b"x", "MALFORMED_REQUEST", 400),
        ("multipart/form-data; boundary=x", b"--x\r\n", "MALFORMED_REQUEST", 400),
        (
            "multipart/form-data; boundary=x",
            b'--x\r\nContent-Disposition: form-data; name="title"\r\n\r\na\r\n'
            b'--x\r\nContent-Disposition: form-data; name="title"\r\n\r\nb\r\n--x--\r\n',
            "VALIDATION_ERROR",
            422,
        ),
        (
            "multipart/form-data; boundary=x",
            b'--x\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\n\r\nx',
            "MALFORMED_REQUEST",
            400,
        ),
    ]:
        result = authorized.post(
            "/api/v1/resources", content=body, headers={"content-type": content_type}
        )
        assert_error(result, status, code)
    assert not runtime.database.exists()
    assert not list(runtime.files.rglob("?" * 32))


def test_unauthorized_before_body_or_storage(
    client: TestClient, runtime: RuntimePaths, monkeypatch: pytest.MonkeyPatch
) -> None:
    def forbidden(*args: Any, **kwargs: Any) -> None:
        pytest.fail("Unauthorized request reached file processing")

    monkeypatch.setattr(Upload, "feed", forbidden)
    monkeypatch.setattr(FileService, "begin", forbidden)
    assert_error(upload(client), 403, "LOCAL_TOKEN_REQUIRED")
    token = client.get("/api/v1/local-session", headers=CONTEXT).json()["data"]["token"]
    client.headers.update(
        {"X-StudyPilot-Token": token, "Origin": "https://evil.example", **CONTEXT}
    )
    assert_error(upload(client), 403, "REQUEST_ORIGIN_FORBIDDEN")
    assert not runtime.database.exists() and list(runtime.files.iterdir()) == []


@pytest.mark.usefixtures("database")
@pytest.mark.parametrize("point", ["register", "promote", "ready"])
def test_crash_points_recover_once(
    authorized: TestClient, monkeypatch: pytest.MonkeyPatch, point: str
) -> None:
    svc = service(authorized)
    if point == "register":
        target: Any
        original = svc.repository.register

        def crash_after_register(*args: Any) -> Any:
            original(*args)
            raise RuntimeError("synthetic crash")

        target, method, replacement = svc.repository, "register", crash_after_register
    else:

        def crash(*args: Any) -> Any:
            raise RuntimeError("synthetic crash")

        target, method, replacement = (
            (svc.storage, "promote", crash)
            if point == "promote"
            else (svc.repository, "ready", crash)
        )
    with monkeypatch.context() as patch:
        patch.setattr(target, method, replacement)
        assert_error(upload(authorized), 500, "UNKNOWN_ERROR")
    row = svc.repository.records()[0]
    assert row.status == "PENDING" and not svc.active
    assert authorized.get("/api/v1/resources").json()["data"] == []
    assert_error(authorized.get(f"/api/v1/resources/{row.resource_id}"), 404, "RESOURCE_NOT_FOUND")
    assert_error(authorized.get(f"/api/v1/files/{row.id}/download"), 409, "FILE_STATE_UNAVAILABLE")
    svc.reconcile()
    svc.reconcile()
    assert svc.repository.get(row.id).status == "READY"
    assert authorized.get(f"/api/v1/files/{row.id}/download").content == b"synthetic\n"


@pytest.mark.usefixtures("database")
def test_pending_commit_rolls_back(authorized: TestClient, database: Engine) -> None:
    def fail(session: Session) -> None:
        if any(isinstance(row, OriginalFile) for row in session.identity_map.values()):
            raise RuntimeError("synthetic commit failure")

    event.listen(Session, "before_commit", fail)
    try:
        assert_error(upload(authorized), 500, "UNKNOWN_ERROR")
    finally:
        event.remove(Session, "before_commit", fail)
    with create_session_factory(database)() as session:
        assert session.scalar(select(func.count()).select_from(LearningResource)) == 0


@pytest.mark.usefixtures("database")
@pytest.mark.parametrize("damage", ["missing", "different"])
def test_damaged_ready_is_failed(
    authorized: TestClient, runtime: RuntimePaths, damage: str
) -> None:
    original = upload(authorized).json()["data"]["original_file"]
    svc = service(authorized)
    row = svc.repository.get(UUID(original["id"]))
    path = runtime.files / row.storage_key
    if damage == "missing":
        path.unlink()
    else:
        path.write_bytes(b"corrupted\n")
    assert_error(authorized.get(f"/api/v1/files/{row.id}/download"), 409, "FILE_CORRUPTED")
    assert svc.repository.get(row.id).status == "FAILED"
    svc.reconcile()
    assert svc.repository.get(row.id).status == "FAILED"
    assert authorized.get("/api/v1/resources").json()["data"] == []


@pytest.mark.usefixtures("database")
def test_startup_restores_trash(authorized: TestClient, runtime: RuntimePaths) -> None:
    original = upload(authorized).json()["data"]["original_file"]
    svc = service(authorized)
    row = svc.repository.get(UUID(original["id"]))
    svc.storage.quarantine(row.storage_key)
    assert (runtime.files / trash_key(row.storage_key)).is_file()
    with TestClient(create_app(), base_url="http://127.0.0.1:8000") as restarted:
        recovered = service(restarted).repository.get(row.id)
        assert recovered.status == "READY"
        assert (runtime.files / row.storage_key).read_bytes() == b"synthetic\n"


@pytest.mark.usefixtures("database")
def test_pending_timeout_and_missing(authorized: TestClient, runtime: RuntimePaths) -> None:
    svc = service(authorized)
    for missing in (True, False):
        key, stream = svc.begin()
        stream.write(b"synthetic")
        stream.close()
        row = svc.repository.register(
            FileCreate(source_type="FILE", title="合成"),
            svc.storage.inspect(key, "notes.txt", "text/plain"),
        )
        svc.release(key, registered=True)
        if missing:
            (runtime.files / key).unlink()
            svc.reconcile()
        else:
            svc.reconcile(row.created_at + timedelta(minutes=10, seconds=1))
        assert svc.repository.get(row.id).status == "FAILED"


@pytest.mark.usefixtures("database")
def test_orphan_grace_active_reference_and_unknown_paths(
    authorized: TestClient, runtime: RuntimePaths, monkeypatch: pytest.MonkeyPatch
) -> None:
    svc = service(authorized)
    original = upload(authorized).json()["data"]["original_file"]
    row = svc.repository.get(UUID(original["id"]))
    old = (datetime.now(UTC) - timedelta(hours=25)).timestamp()
    referenced = runtime.files / row.storage_key
    os.utime(referenced, (old, old))
    active, stream = svc.begin()
    stream.write(b"active")
    stream.close()
    os.utime(runtime.files / active, (old, old))
    orphan, stream = svc.storage.begin()
    stream.write(b"orphan")
    stream.close()
    os.utime(runtime.files / orphan, (old, old))
    fresh, stream = svc.storage.begin()
    stream.write(b"fresh")
    stream.close()
    unknown = runtime.files / "staging" / "user-notes.txt"
    unknown.write_bytes(b"not managed")
    os.utime(unknown, (old, old))
    with monkeypatch.context() as patch:
        patch.setattr(svc.repository, "records", lambda: (_ for _ in ()).throw(RuntimeError()))
        svc.maintain()
    assert (runtime.files / orphan).exists()
    svc.reconcile()
    svc.reconcile()
    assert not (runtime.files / orphan).exists()
    for path in (referenced, runtime.files / active, runtime.files / fresh, unknown):
        assert path.exists()
    svc.release(active)


@pytest.mark.usefixtures("database")
def test_symlink_and_bad_keys_refused(authorized: TestClient, runtime: RuntimePaths) -> None:
    outside = runtime.root / "outside"
    outside.mkdir()
    (runtime.files / "staging").symlink_to(outside, target_is_directory=True)
    assert_error(upload(authorized), 503, "STORAGE_PATH_UNAVAILABLE")
    assert list(outside.iterdir()) == []
    storage = LocalFileStorage(runtime.files)
    for key in ("../outside", "objects/../../outside", "/etc/passwd"):
        with pytest.raises(ResourceError, match="STORAGE_PATH_UNAVAILABLE"):
            storage.read(key, 1, "0" * 64)
    assert_error(authorized.get("/api/v1/files/not-a-uuid/download"), 404, "FILE_NOT_FOUND")
    assert_error(authorized.get(f"/api/v1/files/{uuid4()}/download"), 404, "FILE_NOT_FOUND")


def test_periodic_uses_60_seconds(monkeypatch: pytest.MonkeyPatch) -> None:
    svc = FileService(
        FileRepository(get_settings().database_url), LocalFileStorage(get_settings().files_root)
    )
    calls: list[str | float] = []

    async def sleep(seconds: float) -> None:
        calls.append(seconds)
        if calls.count(60) == 2:
            raise asyncio.CancelledError

    monkeypatch.setattr(asyncio, "sleep", sleep)
    monkeypatch.setattr(svc, "maintain", lambda: calls.append("reconcile"))
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(svc.periodic())
    assert calls == [60, "reconcile", 60]


def test_configured_ancestor_alias_is_canonicalized(runtime: RuntimePaths) -> None:
    alias = runtime.root / "alias"
    alias.symlink_to(runtime.files, target_is_directory=True)
    storage = LocalFileStorage(alias / "controlled")
    key, stream = storage.begin()
    stream.write(b"synthetic")
    stream.close()
    assert (runtime.files / "controlled" / key).read_bytes() == b"synthetic"
    # The root itself still cannot be a symlink to an unrelated directory.
    with pytest.raises(ResourceError, match="STORAGE_PATH_UNAVAILABLE"):
        LocalFileStorage(alias).begin()
