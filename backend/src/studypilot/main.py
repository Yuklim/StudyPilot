"""StudyPilot FastAPI application entry point."""

from fastapi import FastAPI

from studypilot.api.health import router as health_router
from studypilot.infrastructure.security import LocalAccessMiddleware


def create_app() -> FastAPI:
    """Create the minimal non-business application scaffold."""

    application = FastAPI(
        title="StudyPilot",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    application.add_middleware(LocalAccessMiddleware)
    application.include_router(health_router)
    return application


app = create_app()
