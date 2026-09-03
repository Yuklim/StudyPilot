"""Contract section 7: check headers before consuming any ASGI request body."""

import secrets
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from studypilot.infrastructure.config import Settings

METHODS = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE"})
WRITES = METHODS - {"GET"}
CORS_HEADERS = frozenset(
    {"content-type", "x-studypilot-token", "x-studypilot-deletion-token", "if-match"}
)
FETCH = {"sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty"}
MESSAGES = {
    "HOST_FORBIDDEN": "请求地址不受信任。",
    "REQUEST_ORIGIN_FORBIDDEN": "请求来源不受信任。请从本机页面操作。",
    "LOCAL_TOKEN_REQUIRED": "请先连接本次本机服务。",
    "LOCAL_TOKEN_INVALID": "本机连接已失效。请重新连接后操作。",
    "UNKNOWN_ERROR": "服务暂时无法完成请求。",
}


@dataclass
class LocalSession:
    """One app lifespan, no persistence, never include the token in repr/logs."""

    settings: Settings = field(default_factory=Settings)
    token: str | None = field(default=None, repr=False)

    def start(self) -> None:
        self.token = secrets.token_urlsafe(32)

    def stop(self) -> None:
        self.token = None


class LocalAccessMiddleware:
    def __init__(self, app: ASGIApp, session: LocalSession | None = None) -> None:
        self.app = app
        self.session = session if session is not None else LocalSession()
        # Copy canonical values once; request headers never change the trust boundary.
        self.authority = self.session.settings.api_authority
        self.origin = self.session.settings.ui_origin

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = str(scope.get("path", ""))
        raw = scope.get("raw_path", path.encode()).decode("latin-1")
        absolute = raw.startswith(("http://", "https://"))
        malformed_target = False
        try:
            target = urlsplit(raw) if absolute else None
        except ValueError:
            target = None
            malformed_target = True
        api_path = target.path if target else path
        if not any(p == "/api/v1" or p.startswith("/api/v1/") for p in (api_path, path)):
            await self.app(scope, receive, send)
            return

        request_id = "req_" + secrets.token_hex(16)
        headers: dict[str, str] = {}
        raw_headers = scope.get("headers", [])
        bad_headers = len(raw_headers) > 100 or sum(len(k) + len(v) for k, v in raw_headers) > 16384
        duplicates: set[str] = set()
        for key, value in raw_headers:
            name = key.decode("latin-1").lower()
            if name in headers:
                duplicates.add(name)
            headers[name] = value.decode("latin-1")

        async def protected_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                # Preserve only the approved stricter download policy; all other
                # callers still receive forced no-store, never arbitrary caching.
                private = (b"cache-control", b"private, no-store") in message.get("headers", [])
                response_headers = [
                    (k, v)
                    for k, v in message.get("headers", [])
                    if k.lower() not in {b"cache-control", b"x-request-id"}
                ]
                response_headers.extend(
                    [
                        (b"cache-control", b"private, no-store" if private else b"no-store"),
                        (b"x-request-id", request_id.encode("ascii")),
                    ]
                )
                if headers.get("origin") == self.origin and "origin" not in duplicates:
                    response_headers.extend(
                        [
                            (b"access-control-allow-origin", self.origin.encode("ascii")),
                            (b"vary", b"Origin"),
                        ]
                    )
                message = {**message, "headers": response_headers}
            await send(message)

        async def reject(code: str, status: int = 403) -> None:
            await JSONResponse(
                status_code=status,
                content={
                    "error": {
                        "code": code,
                        "message": MESSAGES[code],
                        "details": {},
                        "request_id": request_id,
                    }
                },
            )(scope, receive, protected_send)

        if (
            bad_headers
            or malformed_target
            or "host" in duplicates
            or headers.get("host") != self.authority
            or "forwarded" in headers
            or "x-forwarded-host" in headers
            or (target is not None and (target.netloc != self.authority or target.scheme != "http"))
            or (target is not None and path not in (raw, target.path))
        ):
            await reject("HOST_FORBIDDEN")
            return

        if duplicates & (
            {
                "origin",
                "content-type",
                "content-length",
                "transfer-encoding",
                "access-control-request-method",
                "access-control-request-headers",
            }
            | FETCH.keys()
        ):
            await reject("REQUEST_ORIGIN_FORBIDDEN")
            return

        method = scope["method"]
        if method == "OPTIONS":
            requested_headers = headers.get("access-control-request-headers", "")
            names = (
                {name.strip().lower() for name in requested_headers.split(",")}
                if requested_headers
                else set()
            )
            if (
                headers.get("origin") != self.origin
                or headers.get("access-control-request-method") not in METHODS
                or not names <= CORS_HEADERS
            ):
                await reject("REQUEST_ORIGIN_FORBIDDEN")
                return
            await Response(
                status_code=204,
                headers={
                    "Access-Control-Allow-Methods": ", ".join(sorted(METHODS)),
                    "Access-Control-Allow-Headers": ", ".join(sorted(CORS_HEADERS)),
                },
            )(scope, receive, protected_send)
            return

        fetch_ok = all(headers.get(name) == value for name, value in FETCH.items())
        origin = headers.get("origin")
        if api_path == "/api/v1/local-session":
            if method != "GET" or not fetch_ok or (origin is not None and origin != self.origin):
                await reject("REQUEST_ORIGIN_FORBIDDEN")
            elif self.session.token is None:
                await reject("UNKNOWN_ERROR", 500)
            else:
                await JSONResponse(
                    {"data": {"token": self.session.token, "expires_on_restart": True}}
                )(scope, receive, protected_send)
            return

        token = headers.get("x-studypilot-token")
        if token is None:
            await reject("LOCAL_TOKEN_REQUIRED")
            return
        if (
            "x-studypilot-token" in duplicates
            or self.session.token is None
            or not secrets.compare_digest(
                token.encode("latin-1"), self.session.token.encode("ascii")
            )
        ):
            await reject("LOCAL_TOKEN_INVALID")
            return

        # CLI reads may omit all browser context (contract 7.3). Explicit context
        # must never be cross-site or partially forged; writes require all of it.
        if (
            method not in METHODS
            or (method in WRITES and (origin != self.origin or not fetch_ok))
            or (origin is not None and origin != self.origin)
            or (any(name in headers for name in FETCH) and not fetch_ok)
        ):
            await reject("REQUEST_ORIGIN_FORBIDDEN")
            return

        scope.setdefault("state", {})["request_id"] = request_id
        await self.app(scope, receive, protected_send)
