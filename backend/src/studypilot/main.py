"""StudyPilot FastAPI application entry point."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from studypilot.api.health import router as health_router
from studypilot.api.resources import router as resources_router
from studypilot.api.taxonomy import router as taxonomy_router
from studypilot.infrastructure.config import get_settings
from studypilot.infrastructure.security import LocalAccessMiddleware
from studypilot.infrastructure.security.local_access import LocalSession


def create_app() -> FastAPI:
    """Create a local-only app; startup never connects or migrates the database."""

    session = LocalSession(get_settings())

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        session.start()
        try:
            yield
        finally:
            session.stop()

    application = FastAPI(
        title="StudyPilot",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    application.add_middleware(LocalAccessMiddleware, session=session)
    application.include_router(health_router)
    application.include_router(resources_router)
    application.include_router(taxonomy_router)
    return application


app = create_app()
