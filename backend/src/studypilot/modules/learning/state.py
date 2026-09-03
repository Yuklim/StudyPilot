"""Pure transition checks; review-plan writes belong to the reviews module."""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from .contracts import LearningError, StudyRecordCreate

TRANSITIONS = {
    "UNREAD": {"UNREAD", "IN_PROGRESS", "ARCHIVED"},
    "IN_PROGRESS": {"UNREAD", "IN_PROGRESS", "COMPLETED", "REVIEW_DUE", "ARCHIVED"},
    "COMPLETED": {"IN_PROGRESS", "COMPLETED", "REVIEW_DUE", "ARCHIVED"},
    "REVIEW_DUE": {"IN_PROGRESS", "COMPLETED", "REVIEW_DUE", "ARCHIVED"},
}


@dataclass(frozen=True)
class ProgressState:
    status: str
    progress_percent: int
    started_at: datetime | None
    completed_at: datetime | None
    archived_from_status: str | None
    version: int


def changes(
    current: ProgressState, command: StudyRecordCreate, plan_status: str | None, now: datetime
) -> dict[str, Any]:
    if command.expected_progress_version != current.version:
        raise LearningError("VERSION_CONFLICT", 409, {"current_version": current.version})
    if (
        command.status_before != current.status
        or command.progress_before != current.progress_percent
    ):
        raise LearningError("STATE_CONFLICT", 409)
    before, after = current.status, command.status_after
    allowed = (
        {"ARCHIVED", current.archived_from_status} if before == "ARCHIVED" else TRANSITIONS[before]
    )
    if after not in allowed:
        raise LearningError("INVALID_STATE_TRANSITION", 409)
    if (
        before == after
        and command.progress_after == current.progress_percent
        and not (command.summary or "").strip()
    ):
        raise LearningError("STATE_CONFLICT", 409)
    # Archive/restore is not an implicit progress edit.
    if (
        before != after
        and "ARCHIVED" in (before, after)
        and command.progress_after != current.progress_percent
    ):
        raise LearningError("STATE_CONFLICT", 409)
    remembered = before if after == "ARCHIVED" and before != after else current.archived_from_status
    effective = remembered if after == "ARCHIVED" else after
    if effective == "UNREAD" and command.progress_after != 0:
        raise LearningError("STATE_CONFLICT", 409)
    if effective == "REVIEW_DUE":
        if plan_status != "SCHEDULED":
            raise LearningError("STATE_CONFLICT", 409)
    elif plan_status == "SCHEDULED":
        # Cannot leave a scheduled plan attached to a non-review state.
        raise LearningError("STATE_CONFLICT", 409)
    if before == "REVIEW_DUE" and after in {"IN_PROGRESS", "COMPLETED"} and plan_status != "PAUSED":
        raise LearningError("STATE_CONFLICT", 409)
    result: dict[str, Any] = {
        "status": after,
        "progress_percent": command.progress_after,
        "archived_from_status": remembered if after == "ARCHIVED" else None,
    }
    if before != after and before != "ARCHIVED" and after != "ARCHIVED":
        if after == "IN_PROGRESS":
            if current.started_at is None:
                result["started_at"] = command.started_at.astimezone(UTC)
            result["completed_at"] = None
        elif after == "COMPLETED":
            result["completed_at"] = now
    return result
