"""Reusable test helpers, never imported by production application code."""

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from studypilot.infrastructure.database import migration_connection
from studypilot.infrastructure.database.models import LearningResource

BACKEND = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class RuntimePaths:
    root: Path
    database: Path
    files: Path

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.database}"


def runtime_paths(root: Path) -> RuntimePaths:
    files = root / "files"
    files.mkdir()
    return RuntimePaths(root=root, database=root / "database" / "test.db", files=files)


def migrate(engine: Engine, target: str = "head", *, downgrade: bool = False) -> None:
    configuration = Config(str(BACKEND / "alembic.ini"))
    # Foreign keys stay disabled for the migration connection (see
    # migration_connection); Alembic's own transaction manages commit/rollback.
    with migration_connection(engine) as connection:
        configuration.attributes["connection"] = connection
        if downgrade:
            command.downgrade(configuration, target)
        else:
            command.upgrade(configuration, target)


def resource(session: Session, **values: Any) -> LearningResource:
    record = LearningResource(
        **{"title": "Test resource", "source_type": "WEB", "source_url": "https://example.test"}
        | values
    )
    session.add(record)
    session.flush()
    return record
