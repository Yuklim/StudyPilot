"""Exercise the committed migration, never a user's runtime database."""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect, select
from support import BACKEND, migrate

from studypilot.infrastructure.database import Base, create_database_engine, create_session_factory
from studypilot.infrastructure.database.models import LearningResource, Note, Topic


def test_upgrade_is_repeatable_and_matches_models(tmp_path: Path) -> None:
    engine = create_database_engine(f"sqlite:///{tmp_path / 'fresh.db'}")
    try:
        migrate(engine)
        factory = create_session_factory(engine)
        with factory.begin() as session:
            session.add(Topic(name="Kept after upgrade"))
        migrate(engine)
        with engine.connect() as connection:
            assert set(inspect(connection).get_table_names()) == {
                *Base.metadata.tables,
                "alembic_version",
            }
            context = MigrationContext.configure(connection, opts={"compare_type": True})
            assert context.get_current_heads() == ("0003_resource_title_nullable",)
            assert compare_metadata(context, Base.metadata) == []
        with factory() as session:
            assert session.scalar(select(Topic.name)) == "Kept after upgrade"
    finally:
        engine.dispose()


def test_empty_downgrade_and_reupgrade(tmp_path: Path) -> None:
    engine = create_database_engine(f"sqlite:///{tmp_path / 'empty.db'}")
    try:
        migrate(engine)
        migrate(engine, "base", downgrade=True)
        assert inspect(engine).get_table_names() == ["alembic_version"]
        migrate(engine)
        assert len(inspect(engine).get_table_names()) == 12
    finally:
        engine.dispose()


def test_nonempty_downgrade_refuses_before_dropping_any_table(tmp_path: Path) -> None:
    engine = create_database_engine(f"sqlite:///{tmp_path / 'protected.db'}")
    try:
        migrate(engine)
        factory = create_session_factory(engine)
        with factory.begin() as session:
            session.add(Topic(name="Must not be deleted"))
        before = set(inspect(engine).get_table_names())
        with pytest.raises(RuntimeError, match="non-empty"):
            migrate(engine, "base", downgrade=True)
        assert set(inspect(engine).get_table_names()) == before
        with engine.connect() as connection:
            # The downgrade runs in one transaction; the non-empty guard aborts it,
            # rolling back the already-applied 0002 step too, so head stays put.
            assert MigrationContext.configure(connection).get_current_heads() == (
                "0003_resource_title_nullable",
            )
        with factory() as session:
            assert session.scalar(select(Topic.name)) == "Must not be deleted"
    finally:
        engine.dispose()


def test_0001_to_head_keeps_attached_notes_and_allows_standalone(tmp_path: Path) -> None:
    """Upgrading an 0001 database to head must not lose attached notes and
    must make resource_id nullable so standalone notes can be stored."""
    engine = create_database_engine(f"sqlite:///{tmp_path / 'upgrade.db'}")
    try:
        # Build an 0001-era database with an attached note.
        migrate(engine, "0001_initial")
        factory = create_session_factory(engine)
        with factory.begin() as session:
            resource = LearningResource(
                title="Attached", source_type="PASTE", pasted_content="body"
            )
            session.add(resource)
            session.flush()
            attached = Note(resource_id=resource.id, content="stays attached")
            session.add(attached)
        # Upgrade to head; the previously attached note survives.
        migrate(engine)
        with factory() as session:
            assert {note.content for note in session.query(Note).all()} == {"stays attached"}
        # After the upgrade resource_id is nullable, so a standalone note persists.
        with factory.begin() as session:
            session.add(Note(resource_id=None, content="free standing"))
        with factory() as session:
            assert {note.content for note in session.query(Note).all()} == {
                "stays attached",
                "free standing",
            }
    finally:
        engine.dispose()


def test_0001_to_head_allows_untitled_resources(tmp_path: Path) -> None:
    """Upgrading an 0001 database to head must relax title to nullable so an
    untitled resource can be stored after the migration."""
    engine = create_database_engine(f"sqlite:///{tmp_path / 'untitled.db'}")
    try:
        migrate(engine, "0001_initial")
        migrate(engine)
        factory = create_session_factory(engine)
        with factory.begin() as session:
            resource = LearningResource(
                title=None,
                source_type="WEB",
                source_url="https://example.test/untitled",
            )
            session.add(resource)
            session.flush()
            resource_id = resource.id
        with factory() as session:
            row = session.scalar(select(LearningResource).where(LearningResource.id == resource_id))
            assert row is not None and row.title is None
    finally:
        engine.dispose()


def test_cli_uses_explicit_environment_url_and_import_has_no_side_effects(tmp_path: Path) -> None:
    database = tmp_path / "runtime" / "cli.db"
    environment = {
        **os.environ,
        "STUDYPILOT_DATABASE_URL": f"sqlite:///{database}",
        "PYTHONDONTWRITEBYTECODE": "1",
    }
    subprocess.run(
        [sys.executable, "-c", "import studypilot.main; import studypilot.infrastructure.database"],
        cwd=tmp_path,
        env=environment,
        check=True,
        capture_output=True,
    )
    assert not database.parent.exists()
    subprocess.run(
        [sys.executable, "-m", "alembic", "-c", str(BACKEND / "alembic.ini"), "upgrade", "head"],
        cwd=tmp_path,
        env=environment,
        check=True,
        capture_output=True,
    )
    assert database.is_file()
    engine = create_database_engine(f"sqlite:///{database}")
    try:
        assert set(inspect(engine).get_table_names()) == {*Base.metadata.tables, "alembic_version"}
    finally:
        engine.dispose()
