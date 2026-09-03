"""Security matrix against raw ASGI and the actual app, using synthetic inputs."""

import asyncio
import json
from pathlib import Path
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from starlette.responses import JSONResponse
from starlette.types import Message, Scope
from support import RuntimePaths

from studypilot.infrastructure.config import Settings
from studypilot.infrastructure.security.local_access import LocalAccessMiddleware, LocalSession
from studypilot.main import create_app

ORIGIN = "http://127.0.0.1:5173"
CONTEXT = {"sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty"}


def require_without_secrets(condition: bool) -> None:
    # Keep pytest assertion explanations from printing real ephemeral credentials.
    assert condition


def test_real_bootstrap_lifecycle_and_no_business_data(
    client: TestClient, runtime: RuntimePaths
) -> None:
    first = client.get("/api/v1/local-session", headers=CONTEXT)
    assert first.status_code == 200
    data = first.json()["data"]
    assert set(data) == {"token", "expires_on_restart"}
    assert data["expires_on_restart"] is True
    require_without_secrets(len(data["token"]) >= 43)
    assert first.headers["cache-control"] == "no-store"
    assert "set-cookie" not in first.headers
    require_without_secrets(
        first.json() == client.get("/api/v1/local-session", headers=CONTEXT).json()
    )
    with TestClient(create_app(), base_url="http://127.0.0.1:8000") as other:
        second = other.get("/api/v1/local-session", headers=CONTEXT).json()["data"]
        require_without_secrets(data["token"] != second["token"])
        old = other.get("/api/v1/unknown", headers={"X-StudyPilot-Token": data["token"]})
        assert old.status_code == 403
        assert old.json()["error"]["code"] == "LOCAL_TOKEN_INVALID"
    assert not runtime.database.exists()
    assert list(runtime.files.iterdir()) == []


def test_restart_rotates_same_app_and_shuts_token_down() -> None:
    session = LocalSession()
    session.start()
    old = session.token
    require_without_secrets(old is not None and old not in repr(session))
    session.stop()
    assert session.token is None
    session.start()
    require_without_secrets(session.token != old)
    app = create_app()
    with TestClient(app, base_url="http://127.0.0.1:8000") as first:
        old = first.get("/api/v1/local-session", headers=CONTEXT).json()["data"]["token"]
    with TestClient(app, base_url="http://127.0.0.1:8000") as restarted:
        require_without_secrets(
            restarted.get("/api/v1/local-session", headers=CONTEXT).json()["data"]["token"] != old
        )


@pytest.mark.parametrize("value", ["0", "65536", "localhost", "8000/path"])
def test_invalid_ports_fail_at_configuration(value: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STUDYPILOT_API_PORT", value)
    with pytest.raises(ValidationError):
        Settings()


def test_ports_are_explicit_and_canonical(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STUDYPILOT_API_PORT", "18000")
    monkeypatch.setenv("STUDYPILOT_UI_PORT", "15173")
    configured = Settings()
    assert configured.api_authority == "127.0.0.1:18000"
    assert configured.ui_origin == "http://127.0.0.1:15173"


def probe(
    tmp_path: Path,
    method: str = "POST",
    changes: dict[str, str | None] | None = None,
    extra: list[tuple[bytes, bytes]] | None = None,
    path: str = "/api/v1/probe",
    raw_path: bytes | None = None,
    started: bool = True,
) -> tuple[int, dict[str, str], dict[str, Any], bool]:
    session = LocalSession()
    if started:
        session.start()
    headers = {
        "host": "127.0.0.1:8000",
        "origin": ORIGIN,
        **CONTEXT,
        "x-studypilot-token": session.token or "synthetic-not-started",
    }
    for key, value in (changes or {}).items():
        if value is None:
            headers.pop(key, None)
        else:
            headers[key] = value
    scope = cast(
        Scope,
        {
            "type": "http",
            "method": method,
            "path": path,
            "raw_path": raw_path or path.encode(),
            "query_string": b"",
            "headers": [(k.encode(), v.encode("latin-1")) for k, v in headers.items()]
            + (extra or []),
        },
    )
    marker = tmp_path / "route-reached"
    reached = False
    received = False
    sent: list[Message] = []

    async def app(scope: Scope, receive: Any, send: Any) -> None:
        nonlocal reached
        reached = True
        marker.write_text("synthetic route side effect", encoding="utf-8")
        await receive()
        await JSONResponse({"data": "synthetic"})(scope, receive, send)

    async def receive() -> Message:
        nonlocal received
        received = True
        return {"type": "http.request", "body": b"synthetic body", "more_body": False}

    async def send(message: Message) -> None:
        sent.append(message)

    asyncio.run(LocalAccessMiddleware(app, session)(scope, receive, send))
    status = sent[0]["status"]
    if status != 200 or path == "/api/v1/local-session":
        assert not reached and not received and not marker.exists()
    result_headers = {k.decode(): v.decode() for k, v in sent[0]["headers"]}
    body = b"".join(m.get("body", b"") for m in sent[1:])
    payload = json.loads(body) if body else {}
    if status >= 400:
        assert set(payload) == {"error"}
        assert set(payload["error"]) == {"code", "message", "details", "request_id"}
        assert payload["error"]["details"] == {}
        assert payload["error"]["request_id"] == result_headers["x-request-id"]
        require_without_secrets(session.token is None or session.token.encode() not in body)
        assert b"synthetic body" not in body
    return status, result_headers, payload, reached


@pytest.mark.parametrize("method", ["GET", "POST", "PUT", "PATCH", "DELETE"])
def test_authorized_requests_reach_route(tmp_path: Path, method: str) -> None:
    assert probe(tmp_path, method)[3] is True


@pytest.mark.parametrize(
    "changes,code",
    [
        ({"host": None}, "HOST_FORBIDDEN"),
        ({"host": "localhost:8000"}, "HOST_FORBIDDEN"),
        ({"host": "127.0.0.1:5173"}, "HOST_FORBIDDEN"),
        ({"host": "[::1]:8000"}, "HOST_FORBIDDEN"),
        ({"host": "evil.invalid"}, "HOST_FORBIDDEN"),
        ({"forwarded": "host=127.0.0.1:8000"}, "HOST_FORBIDDEN"),
        ({"x-forwarded-host": "127.0.0.1:8000"}, "HOST_FORBIDDEN"),
        ({"x-studypilot-token": None}, "LOCAL_TOKEN_REQUIRED"),
        ({"x-studypilot-token": "synthetic-invalid"}, "LOCAL_TOKEN_INVALID"),
        ({"x-studypilot-token": "é"}, "LOCAL_TOKEN_INVALID"),
        ({"origin": None}, "REQUEST_ORIGIN_FORBIDDEN"),
        ({"origin": "null"}, "REQUEST_ORIGIN_FORBIDDEN"),
        ({"origin": ORIGIN + "/"}, "REQUEST_ORIGIN_FORBIDDEN"),
        ({"origin": "http://localhost:5173"}, "REQUEST_ORIGIN_FORBIDDEN"),
        ({"sec-fetch-site": "cross-site"}, "REQUEST_ORIGIN_FORBIDDEN"),
        ({"sec-fetch-site": "same-site"}, "REQUEST_ORIGIN_FORBIDDEN"),
        ({"sec-fetch-site": None}, "REQUEST_ORIGIN_FORBIDDEN"),
        ({"sec-fetch-mode": "navigate"}, "REQUEST_ORIGIN_FORBIDDEN"),
        ({"sec-fetch-mode": None}, "REQUEST_ORIGIN_FORBIDDEN"),
        ({"sec-fetch-dest": "document"}, "REQUEST_ORIGIN_FORBIDDEN"),
        ({"sec-fetch-dest": None}, "REQUEST_ORIGIN_FORBIDDEN"),
    ],
)
def test_denials_precede_body_and_side_effects(
    tmp_path: Path, changes: dict[str, str | None], code: str
) -> None:
    status, headers, payload, _ = probe(tmp_path, changes=changes)
    assert status == 403 and payload["error"]["code"] == code
    assert headers["cache-control"] == "no-store"
    assert "access-control-allow-credentials" not in headers


@pytest.mark.parametrize(
    "key,value,code",
    [
        (b"host", b"127.0.0.1:8000", "HOST_FORBIDDEN"),
        (b"Origin", ORIGIN.encode(), "REQUEST_ORIGIN_FORBIDDEN"),
        (b"sec-fetch-site", b"same-origin", "REQUEST_ORIGIN_FORBIDDEN"),
        (b"x-studypilot-token", b"synthetic", "LOCAL_TOKEN_INVALID"),
    ],
)
def test_duplicate_security_headers(tmp_path: Path, key: bytes, value: bytes, code: str) -> None:
    result = probe(tmp_path, extra=[(key, value)])
    assert result[0] == 403 and result[2]["error"]["code"] == code


@pytest.mark.parametrize(
    "raw",
    [
        b"http://evil.invalid/api/v1/probe",
        b"https://127.0.0.1:8000/api/v1/probe",
        b"http://127.0.0.1:8000/health",
        b"http://[bad/api/v1/probe",
    ],
)
def test_absolute_target_cannot_override_host_or_api_path(tmp_path: Path, raw: bytes) -> None:
    assert probe(tmp_path, raw_path=raw)[2]["error"]["code"] == "HOST_FORBIDDEN"


def test_matching_absolute_target_and_header_limits(tmp_path: Path) -> None:
    assert probe(tmp_path, raw_path=b"http://127.0.0.1:8000/api/v1/probe")[3]


@pytest.mark.parametrize("extra", [[(b"x-large", b"x" * 16384)], [(b"x-count", b"x")] * 101])
def test_header_limits_deny_before_body(tmp_path: Path, extra: list[tuple[bytes, bytes]]) -> None:
    assert probe(tmp_path, extra=extra)[2]["error"]["code"] == "HOST_FORBIDDEN"


def test_cli_read_and_explicit_cross_site_read(tmp_path: Path) -> None:
    assert probe(tmp_path, "GET", {"origin": None, **dict.fromkeys(CONTEXT)})[3]


@pytest.mark.parametrize(
    "changes", [{"sec-fetch-site": "cross-site"}, {"origin": "null"}, {"sec-fetch-mode": None}]
)
def test_explicit_bad_read_context_is_denied(
    tmp_path: Path, changes: dict[str, str | None]
) -> None:
    assert probe(tmp_path, "GET", changes)[0] == 403


def test_bootstrap_without_token_or_origin_reads_nothing(tmp_path: Path) -> None:
    result = probe(
        tmp_path, "GET", {"origin": None, "x-studypilot-token": None}, path="/api/v1/local-session"
    )
    assert result[0] == 200 and result[2]["data"]["expires_on_restart"] is True


@pytest.mark.parametrize(
    "changes",
    [
        {"origin": "null"},
        {"sec-fetch-site": "cross-site"},
        {"sec-fetch-mode": None},
        {"sec-fetch-dest": "document"},
    ],
)
def test_bootstrap_context_required(tmp_path: Path, changes: dict[str, str | None]) -> None:
    assert probe(tmp_path, "GET", changes, path="/api/v1/local-session")[0] == 403


def test_bootstrap_before_startup_is_safe_error(tmp_path: Path) -> None:
    result = probe(tmp_path, "GET", path="/api/v1/local-session", started=False)
    assert result[0] == 500 and result[2]["error"]["code"] == "UNKNOWN_ERROR"


def test_valid_preflight_without_token_has_no_side_effects(tmp_path: Path) -> None:
    result = probe(
        tmp_path,
        "OPTIONS",
        {
            "x-studypilot-token": None,
            "access-control-request-method": "POST",
            "access-control-request-headers": "Content-Type, X-StudyPilot-Token",
        },
    )
    assert result[0] == 204 and result[2] == {}
    assert result[1]["access-control-allow-origin"] == ORIGIN
    assert "*" not in str(result[1]) and "access-control-allow-credentials" not in result[1]


@pytest.mark.parametrize(
    "changes",
    [
        {"origin": "https://evil.invalid", "access-control-request-method": "POST"},
        {"access-control-request-method": "TRACE"},
        {"access-control-request-method": "POST", "access-control-request-headers": "Cookie"},
        {
            "access-control-request-method": "POST",
            "access-control-request-headers": "Authorization",
        },
        {},
    ],
)
def test_invalid_preflight_is_denied(tmp_path: Path, changes: dict[str, str | None]) -> None:
    assert probe(tmp_path, "OPTIONS", changes)[0] == 403
