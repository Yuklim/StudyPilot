"""Explicit database entry points; importing this package never opens a connection."""

from .connection import create_database_engine, create_session_factory, session_scope
from .models import Base

__all__ = ["Base", "create_database_engine", "create_session_factory", "session_scope"]
