"""Default-deny boundary for business API requests.

The full Host, Origin, Fetch Metadata and process-token contract deliberately belongs
to a later task. Until that contract is approved, no `/api/v1` request is allowed to
reach a route handler or consume a request body.
"""

from collections.abc import Callable

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

AccessPolicy = Callable[[Scope], bool]


def deny_business_api_until_policy_is_approved(scope: Scope) -> bool:
    """Single extension point for the later, approved local-access contract."""

    path = str(scope.get("path", ""))
    return not (path == "/api/v1" or path.startswith("/api/v1/"))


class LocalAccessMiddleware:
    """Reject protected paths without invoking or reading from ``receive``."""

    def __init__(
        self,
        app: ASGIApp,
        policy: AccessPolicy = deny_business_api_until_policy_is_approved,
    ) -> None:
        self.app = app
        self.policy = policy

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and not self.policy(scope):
            response = JSONResponse(status_code=403, content={"detail": "Forbidden"})
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
