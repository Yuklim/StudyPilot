"""Persistence and constraint tests against isolated, Alembic-migrated SQLite files."""

from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import Engine, func, select, text
from sqlalchemy.exc import IntegrityError, StatementError
from sqlalchemy.orm.exc import StaleDataError
from support import resource

from studypilot.infrastructure.database import (
    Base,
    create_database_engine,
    create_session_factory,
    session_scope,
)
from studypilot.infrastructure.database.models import (
    ActiveReviewPlan,
    DeletionConfirmation,
    LearningProgress,
    LearningResource,
    Note,
    OriginalFile,
    ResourceTag,
    ReviewRecord,
    StudyRecord,
    Tag,
    Topic,
)

NOW = datetime(2026, 9, 3, 10, 0, tzinfo=UTC)


def test_foreign_keys_enabled_on_every_new_connection(database: Engine) -> None:
    # Hold both connections to force separate DBAPI connections from the pool.
    with database.connect() as first, database.connect() as second:
        for connection in (first, second):
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
            assert connection.exec_driver_sql("PRAGMA busy_timeout").scalar_one() == 5000
    with pytest.raises(IntegrityError), create_session_factory(database).begin() as session:
        session.add(Note(resource_id=uuid4(), content="No parent"))


def test_transaction_commit_rollback_and_separate_sessions(database: Engine) -> None:
    factory = create_session_factory(database)
    with session_scope(factory) as first:
        first.add(Topic(name="Committed"))
    with pytest.raises(RuntimeError, match="abort"), session_scope(factory) as failed:
        assert failed is not first
        failed.add(Topic(name="Rolled back"))
        failed.flush()
        raise RuntimeError("abort")
    with factory() as read:
        assert list(read.scalars(select(Topic.name))) == ["Committed"]


def test_utc_roundtrip_naive_rejection_and_calendar_dates(database: Engine) -> None:
    factory = create_session_factory(database)
    local = datetime(2026, 9, 3, 18, 0, tzinfo=timezone(timedelta(hours=8)))
    with factory.begin() as session:
        parent = resource(session, created_at=local, updated_at=local)
        session.add(ActiveReviewPlan(resource_id=parent.id, due_date=date(2026, 9, 12)))
    with factory() as session:
        loaded = session.get(LearningResource, parent.id)
        plan = session.get(ActiveReviewPlan, parent.id)
        assert loaded is not None and plan is not None
        assert loaded.created_at == NOW and loaded.created_at.tzinfo is UTC
        assert plan.due_date == date(2026, 9, 12)
    with pytest.raises(StatementError, match="timezone-aware"), factory.begin() as session:
        resource(session, created_at=datetime(2026, 9, 3, 10, 0))


@pytest.mark.parametrize("model", [Topic, Tag])
def test_normalized_names_are_unique(database: Engine, model: type[Topic] | type[Tag]) -> None:
    factory = create_session_factory(database)
    with factory.begin() as session:
        entry = model(name="  Ｐｙｔｈｏｎ  入门  ")  # noqa: RUF001 - intentional NFKC test
        session.add(entry)
    with factory() as session:
        loaded = session.get(model, entry.id)
        assert isinstance(loaded, (Topic, Tag)) and loaded.normalized_name == "python 入门"
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(model(name="python 入门"))


def test_version_conflict_and_noop_preserve_timestamps(database: Engine) -> None:
    factory = create_session_factory(database)
    with factory.begin() as session:
        entry = Topic(name="Original")
        session.add(entry)
    with factory() as stale, factory() as fresh:
        old = stale.get(Topic, entry.id)
        current = fresh.get(Topic, entry.id)
        assert old is not None and current is not None
        stale.commit()  # End the read transaction while keeping its stale object.
        original_time = current.updated_at
        current.name = "Original"
        fresh.commit()
        assert current.version == 1 and current.updated_at == original_time
        current.name = "Changed"
        fresh.commit()
        assert current.version == 2 and current.updated_at >= original_time
        old.name = "Stale overwrite"
        with pytest.raises(StaleDataError):
            stale.commit()
        stale.rollback()


@pytest.mark.parametrize(
    "model,values",
    [
        (
            LearningResource,
            {"title": "", "source_type": "WEB", "source_url": "https://example.test"},
        ),
        (LearningResource, {"title": "x", "source_type": "WEB", "source_url": None}),
        (
            LearningResource,
            {"title": "x", "source_type": "FILE", "source_url": "https://example.test"},
        ),
        (LearningResource, {"title": "x", "source_type": "PASTE", "pasted_content": ""}),
        (LearningProgress, {"progress_percent": 101}),
        (LearningProgress, {"progress_percent": 1, "status": "UNREAD"}),
        (LearningProgress, {"status": "ARCHIVED", "archived_from_status": None}),
        (LearningProgress, {"status": "COMPLETED", "completed_at": None}),
        (LearningProgress, {"status": "NOT_A_STATUS"}),
        (ActiveReviewPlan, {"status": "SCHEDULED", "due_date": None}),
        (ActiveReviewPlan, {"status": "PAUSED", "due_date": date(2026, 9, 12)}),
        (Note, {"content": ""}),
        (Note, {"content": "x" * 50_001}),
        (ReviewRecord, {"planned_date": date(2026, 9, 3), "result": "NEEDS_REVIEW"}),
        (
            StudyRecord,
            {
                "started_at": NOW,
                "duration_seconds": -1,
                "progress_before": 0,
                "progress_after": 10,
                "status_before": "UNREAD",
                "status_after": "IN_PROGRESS",
            },
        ),
    ],
)
def test_invalid_persisted_states_rejected(
    database: Engine, model: type[Base], values: dict[str, Any]
) -> None:
    factory = create_session_factory(database)
    with factory.begin() as session:
        parent = resource(session)
    with pytest.raises(StatementError), factory.begin() as session:
        fields = values if model is LearningResource else {"resource_id": parent.id, **values}
        session.add(model(**fields))


def test_resource_source_is_immutable_in_normal_orm_updates(database: Engine) -> None:
    factory = create_session_factory(database)
    with factory.begin() as session:
        parent = resource(session)
    with pytest.raises(ValueError, match="source_type"), factory.begin() as session:
        loaded = session.get(LearningResource, parent.id)
        assert loaded is not None
        loaded.source_type, loaded.source_url, loaded.pasted_content = "PASTE", None, "new content"


@pytest.mark.parametrize(
    "invalid",
    [
        {"size_bytes": 0},
        {"size_bytes": 26_214_401},
        {"status": "FAILED", "failure_code": None},
        {"status": "READY", "staging_key": "pending-file"},
        {"status": "PENDING", "failure_code": "unexpected"},
        {"media_type": "application/executable"},
        {"media_type": "text/markdown"},
        {"media_type": "text/plain"},
    ],
)
def test_invalid_original_files_rejected(database: Engine, invalid: dict[str, Any]) -> None:
    factory = create_session_factory(database)
    with factory.begin() as session:
        parent = resource(session, source_type="FILE", source_url=None)
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(
            OriginalFile(
                **{
                    "resource_id": parent.id,
                    "original_name": "example.pdf",
                    "storage_key": "resource/file.pdf",
                    "size_bytes": 100,
                    "media_type": "application/pdf",
                    "sha256": "0" * 64,
                }
                | invalid
            )
        )


@pytest.mark.parametrize(
    "media_type",
    ["text/markdown; charset=utf-8", "text/plain; charset=utf-8"],
)
def test_contract_text_media_types_persist(database: Engine, media_type: str) -> None:
    factory = create_session_factory(database)
    with factory.begin() as session:
        parent = resource(session, source_type="FILE", source_url=None)
        original = OriginalFile(
            resource_id=parent.id,
            original_name="example.txt",
            storage_key="resource/text-file",
            size_bytes=100,
            media_type=media_type,
            sha256="0" * 64,
        )
        session.add(original)
    with factory() as session:
        loaded = session.get(OriginalFile, original.id)
        assert loaded is not None and loaded.media_type == media_type


def test_duplicate_association_and_confirmation_digest_rejected(database: Engine) -> None:
    factory = create_session_factory(database)
    with factory.begin() as session:
        parent = resource(session)
        tag = Tag(name="Tag")
        session.add(tag)
        session.flush()
        session.add(ResourceTag(resource_id=parent.id, tag_id=tag.id))
        confirmation = {
            "resource_id": parent.id,
            "resource_version": 1,
            "token_digest": "1" * 64,
            "impact_manifest": {},
            "impact_revision": "2" * 64,
            "created_at": NOW,
            "expires_at": NOW + timedelta(minutes=5),
        }
        session.add(DeletionConfirmation(**confirmation))
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(ResourceTag(resource_id=parent.id, tag_id=tag.id))
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(DeletionConfirmation(**confirmation))


def test_cascade_preserves_taxonomy_and_deletion_confirmation(database: Engine) -> None:
    factory = create_session_factory(database)
    with factory.begin() as session:
        topic, tag = Topic(name="Topic"), Tag(name="Tag")
        session.add_all([topic, tag])
        session.flush()
        parent = resource(session, source_type="FILE", source_url=None, topic_id=topic.id)
        session.add_all(
            [
                OriginalFile(
                    resource_id=parent.id,
                    original_name="notes.pdf",
                    storage_key="file-key",
                    size_bytes=2048,
                    media_type="application/pdf",
                    sha256="a" * 64,
                    status="READY",
                ),
                LearningProgress(resource_id=parent.id),
                ResourceTag(resource_id=parent.id, tag_id=tag.id),
                Note(resource_id=parent.id, content="Personal note"),
                StudyRecord(
                    resource_id=parent.id,
                    started_at=NOW,
                    duration_seconds=300,
                    progress_before=0,
                    progress_after=10,
                    status_before="UNREAD",
                    status_after="IN_PROGRESS",
                ),
                ActiveReviewPlan(resource_id=parent.id, due_date=date(2026, 9, 12)),
                ReviewRecord(
                    resource_id=parent.id, planned_date=date(2026, 9, 3), result="UNDERSTOOD"
                ),
                DeletionConfirmation(
                    resource_id=parent.id,
                    resource_version=1,
                    token_digest="b" * 64,
                    impact_manifest={"resource_id": str(parent.id)},
                    impact_revision="c" * 64,
                    created_at=NOW,
                    expires_at=NOW + timedelta(minutes=5),
                ),
            ]
        )
    for model, identifier in ((Topic, topic.id), (Tag, tag.id)):
        with pytest.raises(IntegrityError), factory.begin() as session:
            loaded = session.get(model, identifier)
            assert loaded is not None
            session.delete(loaded)
    with factory.begin() as session:
        loaded_resource = session.get(LearningResource, parent.id)
        assert loaded_resource is not None
        session.delete(loaded_resource)
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(DeletionConfirmation)) == 1
        assert session.scalar(select(func.count()).select_from(Topic)) == 1
        assert session.scalar(select(func.count()).select_from(Tag)) == 1
        for table in Base.metadata.tables.values():
            if table.name not in {"topics", "tags", "deletion_confirmations"}:
                assert session.scalar(select(func.count()).select_from(table)) == 0
    assert "confirmation_token" not in Base.metadata.tables["deletion_confirmations"].c


@pytest.mark.parametrize("action", ["update", "delete"])
@pytest.mark.parametrize("model", [StudyRecord, ReviewRecord])
def test_history_cannot_be_changed_through_normal_orm(
    database: Engine, model: type[StudyRecord] | type[ReviewRecord], action: str
) -> None:
    factory = create_session_factory(database)
    with factory.begin() as session:
        parent = resource(session)
        entry = (
            StudyRecord(
                resource_id=parent.id,
                started_at=NOW,
                duration_seconds=60,
                progress_before=0,
                progress_after=10,
                status_before="UNREAD",
                status_after="IN_PROGRESS",
            )
            if model is StudyRecord
            else ReviewRecord(
                resource_id=parent.id, planned_date=date(2026, 9, 3), result="UNDERSTOOD"
            )
        )
        session.add(entry)
    with pytest.raises(ValueError, match="append-only"), factory.begin() as session:
        loaded = session.get(model, entry.id)
        assert loaded is not None
        if action == "delete":
            session.delete(loaded)
        elif isinstance(loaded, StudyRecord):
            loaded.summary = "Cannot overwrite"
        else:
            assert isinstance(loaded, ReviewRecord)
            loaded.notes = "Cannot overwrite"


def test_memory_engines_are_isolated_and_explicit(database: Engine) -> None:
    separate = create_database_engine("sqlite:///:memory:")
    try:
        with separate.connect() as connection:
            assert (
                connection.execute(
                    text("SELECT count(*) FROM sqlite_master WHERE type='table'")
                ).scalar_one()
                == 0
            )
    finally:
        separate.dispose()
