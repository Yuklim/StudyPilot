"""Keep SQLite-specific connection policy inside the infrastructure boundary."""

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from sqlite3 import Connection as SQLiteConnection

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import URL, Connection, make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import ConnectionPoolEntry, StaticPool

from studypilot.infrastructure.config import get_settings


def set_sqlite_foreign_keys(connection: SQLiteConnection, *, enabled: bool) -> None:
    # PRAGMA foreign_keys must be set outside a transaction, including with
    # Python 3.13's explicit non-legacy transaction control.
    previous = connection.autocommit
    connection.autocommit = True
    try:
        connection.execute("PRAGMA foreign_keys=ON" if enabled else "PRAGMA foreign_keys=OFF")
    finally:
        connection.autocommit = previous


def _sqlite_pragma(
    connection: SQLiteConnection, _: ConnectionPoolEntry, *, foreign_keys: bool
) -> None:
    set_sqlite_foreign_keys(connection, enabled=foreign_keys)
    previous = connection.autocommit
    connection.autocommit = True
    try:
        connection.execute("PRAGMA busy_timeout=5000")
    finally:
        connection.autocommit = previous


def _resolve_url(database_url: str | URL | None = None) -> URL:
    url = make_url(database_url if database_url is not None else get_settings().database_url)
    if url.get_backend_name() != "sqlite":
        raise ValueError("Only SQLite is supported by the current database baseline")
    if url.drivername not in {"sqlite", "sqlite+pysqlite"} or url.query:
        raise ValueError("Use a plain SQLite file URL without driver/URI query options")
    if url.database not in {None, "", ":memory:"}:
        assert url.database is not None
        Path(url.database).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        url = url.set(database=str(Path(url.database).expanduser().resolve()))
    return url


def create_database_engine(
    database_url: str | URL | None = None, *, foreign_keys: bool = True
) -> Engine:
    """Create an explicit, disposable engine, never a global connection/session.

    SQLite relative paths are relative to the current working directory. Only
    this explicit call creates a missing parent directory; connecting creates
    the file. Neither step creates tables: that is exclusively Alembic's job.
    Foreign keys default ON for runtime connections; migrations pass
    foreign_keys=False (SQLite batch table rebuilds drop the old table).
    """
    url = _resolve_url(database_url)
    memory = url.database in {None, "", ":memory:"}
    engine = create_engine(
        url,
        connect_args={"autocommit": False, "check_same_thread": False, "timeout": 5},
        hide_parameters=True,
        echo=False,
        **({"poolclass": StaticPool} if memory else {}),
    )
    event.listen(
        engine,
        "connect",
        lambda connection, entry, fk=foreign_keys: _sqlite_pragma(
            connection, entry, foreign_keys=fk
        ),
    )
    return engine


@contextmanager
def migration_connection(
    database: Engine | str | URL | None = None,
) -> Iterator[Connection]:
    """Yield a single atomic transaction on a foreign-key-free connection for an
    Alembic run against the given engine/URL (or the configured database URL).

    SQLite cannot drop NOT NULL in place, so batch_alter_table rebuilds the
    table by dropping the old one; with PRAGMA foreign_keys=ON that drop
    cascades into child rows (notes/progress/files/tags/...). Enforcement
    cannot be toggled after a transaction has begun, so a dedicated engine with
    foreign keys OFF from connect is used here. Runtime connections always get
    foreign_keys=ON (create_database_engine's default); this only covers the
    migration connection. Alembic's own context.begin_transaction() joins the
    transaction begun here, keeping the whole run atomic (a failing revision
    rolls back every earlier step).

    Migrations target a real database file: an in-memory URL would point at a
    fresh empty database each time, so it is rejected.
    """
    source = database if database is not None else get_settings().database_url
    url = _resolve_url(source if isinstance(source, (str, URL)) else source.url)
    if url.database in {None, "", ":memory:"}:
        raise ValueError("Migrations need a real database file, not an in-memory URL")
    engine = create_database_engine(url, foreign_keys=False)
    try:
        connection = engine.connect()
        try:
            with connection.begin():
                yield connection
        finally:
            connection.close()
    finally:
        engine.dispose()


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    """Each factory call creates a separate mutable session, never shared globally."""
    return sessionmaker(bind=engine, expire_on_commit=False)


@contextmanager
def session_scope(factory: sessionmaker[Session]) -> Iterator[Session]:
    """Commit the unit of work, or roll back on any exception, then close it."""
    with factory.begin() as session:
        yield session
