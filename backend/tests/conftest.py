"""Function-scoped fixtures keep tests away from real runtime data and state."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker
from support import RuntimePaths, migrate, runtime_paths

from studypilot.infrastructure.config import get_settings
from studypilot.infrastructure.database import create_database_engine, create_session_factory
from studypilot.main import create_app


@pytest.fixture(autouse=True)
def runtime(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[RuntimePaths]:
    paths = runtime_paths(tmp_path)
    monkeypatch.chdir(paths.root)
    monkeypatch.setenv("STUDYPILOT_DATABASE_URL", paths.database_url)
    monkeypatch.setenv("STUDYPILOT_API_PORT", "8000")
    monkeypatch.setenv("STUDYPILOT_UI_PORT", "5173")
    get_settings.cache_clear()
    try:
        yield paths
    finally:
        get_settings.cache_clear()


@pytest.fixture
def database(runtime: RuntimePaths) -> Iterator[Engine]:
    engine = create_database_engine(runtime.database_url)
    try:
        migrate(engine)
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def session_factory(database: Engine) -> sessionmaker[Session]:
    return create_session_factory(database)


@pytest.fixture
def client() -> Iterator[TestClient]:
    # No global app/client: dependency overrides, cookies and lifespan stay local.
    with TestClient(create_app(), base_url="http://127.0.0.1:8000") as instance:
        yield instance
