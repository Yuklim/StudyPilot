"""Prove shared setup isolates repeated cases instead of sharing mutable state."""

from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest
import run_browser_server
from fastapi.testclient import TestClient
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from support import RuntimePaths, resource

from studypilot.infrastructure.config import get_settings
from studypilot.infrastructure.database.models import LearningResource


@pytest.mark.parametrize("iteration", range(2))
def test_each_case_has_fresh_runtime_and_client(
    iteration: int,
    runtime: RuntimePaths,
    database: Engine,
    session_factory: sessionmaker[Session],
    client: TestClient,
) -> None:
    assert Path.cwd() == runtime.root
    assert get_settings().database_url == runtime.database_url
    assert database.url.database == str(runtime.database)
    assert not (runtime.files / "marker.txt").exists()
    assert "test-cookie" not in client.cookies
    with session_factory.begin() as session:
        assert session.scalar(select(func.count()).select_from(LearningResource)) == 0
        resource(session, title=f"Isolated case {iteration}")
    (runtime.files / "marker.txt").write_text("synthetic test marker", encoding="utf-8")
    client.cookies.set("test-cookie", "synthetic")
    assert client.get("/health").status_code == 200


def test_shared_factory_rolls_back_failed_work(
    session_factory: sessionmaker[Session],
) -> None:
    with pytest.raises(RuntimeError, match="intentional"), session_factory.begin() as session:
        resource(session)
        raise RuntimeError("intentional test failure")
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(LearningResource)) == 0


def test_client_without_database_fixture_does_not_create_database(
    runtime: RuntimePaths, client: TestClient
) -> None:
    assert client.get("/health").status_code == 200
    assert client.post("/api/v1/unknown", json={"title": "synthetic"}).status_code == 403
    assert not runtime.database.exists()
    assert list(runtime.files.iterdir()) == []


@pytest.mark.parametrize("interrupted", [False, True])
def test_browser_launcher_reclaims_only_its_own_runtime(
    interrupted: bool, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    existing = tmp_path / "untouched.db"
    existing.write_bytes(b"synthetic sentinel")
    monkeypatch.setenv("STUDYPILOT_DATABASE_URL", f"sqlite:///{existing}")
    monkeypatch.setattr("run_browser_server.signal.signal", lambda *_: None)
    server = MagicMock()
    server.wait.side_effect = [KeyboardInterrupt(), 0] if interrupted else [7]
    server.poll.return_value = None if interrupted else 7
    captured: dict[str, Any] = {}

    def start(*args: Any, **kwargs: Any) -> Any:
        captured.update(kwargs)
        return server

    monkeypatch.setattr("run_browser_server.subprocess.Popen", start)
    assert run_browser_server.main() == (0 if interrupted else 7)
    assert captured["env"]["STUDYPILOT_DATABASE_URL"] != f"sqlite:///{existing}"
    assert not captured["cwd"].exists()
    assert existing.read_bytes() == b"synthetic sentinel"
    assert server.terminate.call_count == (1 if interrupted else 0)
