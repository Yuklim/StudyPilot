"""Keep SQLite-specific connection policy inside the infrastructure boundary."""

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from sqlite3 import Connection as SQLiteConnection

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import ConnectionPoolEntry, StaticPool

from studypilot.infrastructure.config import get_settings


def _configure_sqlite(connection: SQLiteConnection, _: ConnectionPoolEntry) -> None:
    # PRAGMA foreign_keys must be set outside a transaction, including with
    # Python 3.13's explicit non-legacy transaction control.
    previous = connection.autocommit
    connection.autocommit = True
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=5000")
    finally:
        connection.autocommit = previous


def create_database_engine(database_url: str | URL | None = None) -> Engine:
    """Create an explicit, disposable engine, never a global connection/session.

    SQLite relative paths are relative to the current working directory. Only
    this explicit call creates a missing parent directory; connecting creates
    the file. Neither step creates tables: that is exclusively Alembic's job.
    """
    url = make_url(database_url if database_url is not None else get_settings().database_url)
    if url.get_backend_name() != "sqlite":
        raise ValueError("Only SQLite is supported by the current database baseline")
    if url.drivername not in {"sqlite", "sqlite+pysqlite"} or url.query:
        raise ValueError("Use a plain SQLite file URL without driver/URI query options")
    memory = url.database in {None, "", ":memory:"}
    if not memory:
        assert url.database is not None
        Path(url.database).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        url = url.set(database=str(Path(url.database).expanduser().resolve()))
    engine = create_engine(
        url,
        connect_args={"autocommit": False, "check_same_thread": False, "timeout": 5},
        hide_parameters=True,
        echo=False,
        **({"poolclass": StaticPool} if memory else {}),
    )
    event.listen(engine, "connect", _configure_sqlite)
    return engine


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    """Each factory call creates a separate mutable session, never shared globally."""
    return sessionmaker(bind=engine, expire_on_commit=False)


@contextmanager
def session_scope(factory: sessionmaker[Session]) -> Iterator[Session]:
    """Commit the unit of work, or roll back on any exception, then close it."""
    with factory.begin() as session:
        yield session
