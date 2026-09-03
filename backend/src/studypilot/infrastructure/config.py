"""Environment-backed settings without opening a database connection."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """StudyPilot process settings.

    Constructing settings never opens or migrates a database. Relative SQLite
    paths follow the working directory; documented backend commands run here.
    """

    model_config = SettingsConfigDict(env_prefix="STUDYPILOT_", extra="ignore")

    database_url: str = Field(default="sqlite:///./var/studypilot.db")


@lru_cache
def get_settings() -> Settings:
    """Return one immutable-in-practice settings object per process."""

    return Settings()
