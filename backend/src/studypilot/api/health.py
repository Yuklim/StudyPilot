"""Operational health endpoint with no user-data dependencies."""

from typing import Literal, TypedDict

from fastapi import APIRouter


class HealthResponse(TypedDict):
    """The intentionally minimal health response."""

    status: Literal["ok"]
    service: Literal["StudyPilot"]


router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Report only whether the StudyPilot process can serve requests."""

    return {"status": "ok", "service": "StudyPilot"}
