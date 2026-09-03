"""Explicit Alembic migration entry; normal app startup never imports this file."""

from alembic import context
from sqlalchemy.engine import Connection

from studypilot.infrastructure.config import get_settings
from studypilot.infrastructure.database import Base, create_database_engine

config = context.config
target_metadata = Base.metadata


def run_with_connection(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations() -> None:
    if context.is_offline_mode():
        context.configure(
            url=get_settings().database_url,
            target_metadata=target_metadata,
            literal_binds=True,
            dialect_opts={"paramstyle": "named"},
        )
        with context.begin_transaction():
            context.run_migrations()
        return

    supplied_connection = config.attributes.get("connection")
    if supplied_connection is not None:
        run_with_connection(supplied_connection)
        return
    engine = create_database_engine()
    try:
        with engine.begin() as connection:
            run_with_connection(connection)
    finally:
        engine.dispose()


run_migrations()
