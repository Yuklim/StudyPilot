"""StudyPilot FastAPI application entry point."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.concurrency import run_in_threadpool

from studypilot.api.files import router as files_router
from studypilot.api.health import router as health_router
from studypilot.api.learning import router as learning_router
from studypilot.api.notes import router as notes_router
from studypilot.api.notes import standalone_router as standalone_notes_router
from studypilot.api.resources import router as resources_router
from studypilot.api.snapshot_assets import router as snapshot_assets_router
from studypilot.api.snapshots import router as snapshots_router
from studypilot.api.taxonomy import router as taxonomy_router
from studypilot.application.files import FileService
from studypilot.application.snapshot_assets import AssetService
from studypilot.infrastructure.config import get_settings
from studypilot.infrastructure.database.file_store import FileRepository
from studypilot.infrastructure.files.storage import LocalFileStorage
from studypilot.infrastructure.security import LocalAccessMiddleware
from studypilot.infrastructure.security.local_access import LocalSession


def create_app() -> FastAPI:
    """Local-only app; maintain an existing file store, never create/migrate a DB."""

    session = LocalSession(get_settings())
    # One storage instance for both: snapshot assets live in the same controlled
    # directory as uploaded originals, which is what keeps them under the same
    # orphan sweep and the same isolation policy.
    storage = LocalFileStorage(get_settings().files_root)
    files = FileService(FileRepository(get_settings().database_url), storage)
    assets = AssetService(files, storage)

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        session.start()
        await run_in_threadpool(files.maintain)
        maintenance = asyncio.create_task(files.periodic())
        try:
            yield
        finally:
            await files.stop(maintenance)
            session.stop()

    application = FastAPI(
        title="StudyPilot",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    application.add_middleware(LocalAccessMiddleware, session=session)
    application.state.files = files
    application.state.assets = assets
    application.include_router(files_router)
    application.include_router(snapshots_router)
    application.include_router(snapshot_assets_router)
    application.include_router(health_router)
    application.include_router(resources_router)
    application.include_router(taxonomy_router)
    application.include_router(learning_router)
    application.include_router(notes_router)
    application.include_router(standalone_notes_router)
    return application


app = create_app()
