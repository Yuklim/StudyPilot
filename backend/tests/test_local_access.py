"""Security tests proving protected requests are rejected before body access."""

import asyncio
from pathlib import Path
from typing import Any, cast

import pytest
from starlette.types import Message, Scope

from studypilot.infrastructure.security.local_access import LocalAccessMiddleware


@pytest.mark.parametrize(
    ("content_type", "body"),
    [
        ("application/x-www-form-urlencoded", b"title=untrusted"),
        ("text/plain", b"untrusted text"),
        ("multipart/form-data; boundary=boundary", b"--boundary\r\ncontent\r\n"),
    ],
)
def test_unknown_api_requests_are_rejected_before_body_or_side_effects(
    tmp_path: Path,
    content_type: str,
    body: bytes,
) -> None:
    side_effect = tmp_path / "route-was-reached"
    database_file = tmp_path / "unexpected.db"
    receive_was_called = False
    route_was_called = False
    sent_messages: list[Message] = []

    async def protected_route(scope: Scope, receive: Any, send: Any) -> None:
        nonlocal route_was_called
        route_was_called = True
        side_effect.write_text("unexpected", encoding="utf-8")
        database_file.write_bytes(b"unexpected")
        await receive()

    async def receive() -> Message:
        nonlocal receive_was_called
        receive_was_called = True
        raise AssertionError(f"request body was read: {body!r}")

    async def send(message: Message) -> None:
        sent_messages.append(message)

    scope = cast(
        Scope,
        {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/api/v1/unknown",
            "raw_path": b"/api/v1/unknown",
            "query_string": b"",
            "root_path": "",
            "headers": [
                (b"host", b"127.0.0.1:8000"),
                (b"origin", b"http://127.0.0.1:5173"),
                (b"sec-fetch-site", b"same-origin"),
                (b"sec-fetch-mode", b"cors"),
                (b"sec-fetch-dest", b"empty"),
                (b"content-type", content_type.encode("ascii")),
            ],
            "client": ("127.0.0.1", 40000),
            "server": ("127.0.0.1", 8000),
        },
    )

    asyncio.run(LocalAccessMiddleware(protected_route)(scope, receive, send))

    assert receive_was_called is False
    assert route_was_called is False
    assert side_effect.exists() is False
    assert database_file.exists() is False
    assert sent_messages[0]["type"] == "http.response.start"
    assert sent_messages[0]["status"] == 403


def test_api_prefix_itself_is_also_denied() -> None:
    async def unreachable_app(scope: Scope, receive: Any, send: Any) -> None:
        raise AssertionError("protected app was reached")

    async def receive() -> Message:
        raise AssertionError("request body was read")

    messages: list[Message] = []

    async def send(message: Message) -> None:
        messages.append(message)

    scope = cast(
        Scope,
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "method": "GET",
            "path": "/api/v1",
            "headers": [],
        },
    )

    asyncio.run(LocalAccessMiddleware(unreachable_app)(scope, receive, send))

    assert messages[0]["status"] == 403
