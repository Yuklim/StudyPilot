"""Exercise the committed migration, never a user's runtime database."""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError
from support import BACKEND, migrate

from studypilot.infrastructure.database import Base, create_database_engine, create_session_factory
from studypilot.infrastructure.database.models import (
    Highlight,
    LearningResource,
    Note,
    ResourceCitation,
    Topic,
)


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
            assert context.get_current_heads() == ("0010_highlight_style",)
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
        assert len(inspect(engine).get_table_names()) == 16
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
                "0010_highlight_style",
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


def test_0006_widens_note_content_and_refuses_lossy_downgrade(tmp_path: Path) -> None:
    """0006 rebuilds `notes` so content over 50,000 characters is accepted
    (TASK-063 inline images); going back is refused while such a note exists."""
    engine = create_database_engine(f"sqlite:///{tmp_path / 'wide.db'}")
    try:
        migrate(engine, "0005_snapshot_assets")
        factory = create_session_factory(engine)
        with factory.begin() as session:
            session.add(Note(resource_id=None, content="short before"))
        with factory.begin() as session, pytest.raises(IntegrityError):
            session.add(Note(resource_id=None, content="x" * 60_000))
            session.flush()
        migrate(engine)
        with factory.begin() as session:
            session.add(Note(resource_id=None, content="y" * 60_000))
        with factory() as session:
            assert sorted(len(note.content) for note in session.query(Note).all()) == [12, 60_000]
        with pytest.raises(RuntimeError, match="exceed 50000"):
            migrate(engine, "0005_snapshot_assets", downgrade=True)
        with engine.connect() as connection:
            assert MigrationContext.configure(connection).get_current_heads() == (
                "0010_highlight_style",
            )
        with factory.begin() as session:
            session.query(Note).filter(Note.content == "y" * 60_000).delete()
        migrate(engine, "0005_snapshot_assets", downgrade=True)
        with factory.begin() as session, pytest.raises(IntegrityError):
            session.add(Note(resource_id=None, content="z" * 60_000))
            session.flush()
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


def test_0008_adds_citations_and_downgrade_keeps_the_resource(tmp_path: Path) -> None:
    """0008 creates `resource_citations`; going back drops the citations only,
    leaving the resource with its title and address."""
    engine = create_database_engine(f"sqlite:///{tmp_path / 'citations.db'}")
    try:
        migrate(engine, "0007_highlights")
        assert "resource_citations" not in inspect(engine).get_table_names()
        factory = create_session_factory(engine)
        with factory.begin() as session:
            resource = LearningResource(
                title="有文献信息的资料",
                source_type="WEB",
                source_url="https://example.test/paper",
            )
            session.add(resource)
            session.flush()
            resource_id = resource.id
        migrate(engine)
        assert "resource_citations" in inspect(engine).get_table_names()
        with factory.begin() as session:
            session.add(
                ResourceCitation(
                    resource_id=resource_id,
                    item_type="JOURNAL_ARTICLE",
                    authors=["张三", "李四"],
                    issued_year=2024,
                    doi="10.1000/synthetic",
                )
            )
        with factory() as session:
            stored = session.scalar(select(ResourceCitation))
            assert stored is not None
            # Author order is data: it must survive the JSON round trip as given.
            assert stored.authors == ["张三", "李四"] and stored.version == 1
        migrate(engine, "0007_highlights", downgrade=True)
        assert "resource_citations" not in inspect(engine).get_table_names()
        with factory() as session:
            kept = session.get(LearningResource, resource_id)
            assert kept is not None and kept.source_url == "https://example.test/paper"
        migrate(engine)
        with factory() as session:
            assert session.scalar(select(ResourceCitation)) is None
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


def test_0009_adds_page_number_and_refuses_to_drop_pdf_highlights(tmp_path: Path) -> None:
    """0009 lets a highlight name the PDF page its offsets count in. Going back
    below it would silently turn such a highlight into a snapshot anchor that
    points at nothing, so the downgrade refuses while any exists; snapshot
    highlights (no page) come through untouched."""
    engine = create_database_engine(f"sqlite:///{tmp_path / 'pages.db'}")
    try:
        migrate(engine)
        columns = {column["name"] for column in inspect(engine).get_columns("highlights")}
        assert "page_number" in columns
        factory = create_session_factory(engine)
        with factory.begin() as session:
            resource = LearningResource(
                title="按页标过的资料", source_type="WEB", source_url="https://example.test/p"
            )
            session.add(resource)
            session.flush()
            session.add_all(
                [
                    Highlight(
                        resource_id=resource.id,
                        exact="第二页的一句",
                        start_offset=3,
                        end_offset=9,
                        page_number=2,
                    ),
                    Highlight(
                        resource_id=resource.id,
                        exact="快照里的一句",
                        start_offset=0,
                        end_offset=6,
                        page_number=None,
                    ),
                ]
            )
        # The CHECK holds: page numbers start at 1. `pytest.raises` is the outer
        # context so the session's own exit rolls the failed flush back first.
        with pytest.raises(IntegrityError), factory.begin() as session:
            session.add(
                Highlight(
                    resource_id=resource.id, exact="x", start_offset=0, end_offset=1, page_number=0
                )
            )
            session.flush()
        with pytest.raises(RuntimeError, match="anchored in PDF pages"):
            migrate(engine, "0008_resource_citations", downgrade=True)
        # Close the inspecting connection before the next batch rebuild: an open
        # one holds a SQLite lock and the downgrade below would wait on it.
        with engine.connect() as connection:
            assert MigrationContext.configure(connection).get_current_heads() == (
                "0010_highlight_style",
            )
        with factory.begin() as session:
            paged = session.scalar(select(Highlight).where(Highlight.page_number == 2))
            assert paged is not None
            session.delete(paged)
        migrate(engine, "0008_resource_citations", downgrade=True)
        columns = {column["name"] for column in inspect(engine).get_columns("highlights")}
        assert "page_number" not in columns
        migrate(engine)
        with factory() as session:
            kept = session.scalar(select(Highlight))
            assert kept is not None and kept.exact == "快照里的一句" and kept.page_number is None
    finally:
        engine.dispose()


def test_0010_adds_the_look_and_refuses_to_drop_a_styled_highlight(tmp_path: Path) -> None:
    """0010 stores how a highlight is painted (TASK-093). A row that exists when
    the migration runs gets the one look there was (a yellow mark); an underline
    or another colour has no representation below 0010, so the downgrade refuses
    while any exists and lets a default-looking row through."""
    engine = create_database_engine(f"sqlite:///{tmp_path / 'looks.db'}")
    try:
        migrate(engine)
        factory = create_session_factory(engine)
        with factory.begin() as session:
            resource = LearningResource(
                title="标过的资料", source_type="WEB", source_url="https://example.test/s"
            )
            session.add(resource)
            session.flush()
            session.add(
                Highlight(resource_id=resource.id, exact="先标的一句", start_offset=0, end_offset=5)
            )
        # A default-looking row is exactly what 0009 could hold: the downgrade takes
        # it along, and the upgrade gives it the default look back.
        migrate(engine, "0009_highlight_page", downgrade=True)
        columns = {column["name"] for column in inspect(engine).get_columns("highlights")}
        assert not ({"style", "color"} & columns)
        migrate(engine)
        columns = {column["name"] for column in inspect(engine).get_columns("highlights")}
        assert {"style", "color"} <= columns
        with factory() as session:
            old = session.scalar(select(Highlight))
            assert old is not None and (old.style, old.color) == ("mark", "yellow")
        with factory.begin() as session:
            session.add(
                Highlight(
                    resource_id=resource.id,
                    exact="划了线的一句",
                    start_offset=10,
                    end_offset=16,
                    style="underline",
                    color="blue",
                )
            )
        # The CHECKs hold: only the toolbar's values, for both columns.
        for look in ({"color": "red"}, {"style": "bold"}):
            with pytest.raises(IntegrityError), factory.begin() as session:
                session.add(
                    Highlight(
                        resource_id=resource.id, exact="x", start_offset=0, end_offset=1, **look
                    )
                )
                session.flush()
        with pytest.raises(RuntimeError, match="style or colour"):
            migrate(engine, "0009_highlight_page", downgrade=True)
        with engine.connect() as connection:
            assert MigrationContext.configure(connection).get_current_heads() == (
                "0010_highlight_style",
            )
        with factory.begin() as session:
            styled = session.scalar(select(Highlight).where(Highlight.style == "underline"))
            assert styled is not None
            session.delete(styled)
        migrate(engine, "0009_highlight_page", downgrade=True)
        migrate(engine)
        with factory() as session:
            kept = session.scalar(select(Highlight))
            assert kept is not None and kept.exact == "先标的一句"
            assert (kept.style, kept.color) == ("mark", "yellow")
    finally:
        engine.dispose()
