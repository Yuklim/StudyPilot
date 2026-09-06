"""SQLAlchemy adapter for content snapshots; writes only the snapshot table."""

import hashlib
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from studypilot.modules.resources.contracts import ResourceError
from studypilot.modules.resources.snapshots import MANUAL_EXTRACTOR, SnapshotPut

from .models import ContentSnapshot, LearningResource
from .types import utc_now

FIELDS = (
    "id",
    "resource_id",
    "format",
    "content",
    "char_count",
    "sha256",
    "captured_at",
    "captured_from_url",
    "extractor",
    "status",
    "failure_code",
    "version",
    "created_at",
    "updated_at",
)


def project(record: ContentSnapshot) -> dict[str, Any]:
    return {field: getattr(record, field) for field in FIELDS}


class SnapshotStore:
    def __init__(self, session: Session) -> None:
        self.session = session

    def require_resource(self, resource_id: UUID) -> None:
        if self.session.get(LearningResource, resource_id) is None:
            raise ResourceError("RESOURCE_NOT_FOUND", 404)

    def find(self, resource_id: UUID) -> ContentSnapshot | None:
        return self.session.scalar(
            select(ContentSnapshot).where(ContentSnapshot.resource_id == resource_id)
        )

    def detail(self, resource_id: UUID) -> dict[str, Any]:
        self.require_resource(resource_id)
        record = self.find(resource_id)
        if record is None:
            raise ResourceError("SNAPSHOT_NOT_FOUND", 404)
        return project(record)

    def put(self, resource_id: UUID, command: SnapshotPut) -> tuple[dict[str, Any], bool]:
        self.require_resource(resource_id)
        record = self.find(resource_id)
        if record is None:
            if command.expected_version is not None:
                # The caller believes it is replacing something that is not there.
                raise ResourceError("SNAPSHOT_NOT_FOUND", 404)
            record = ContentSnapshot(resource_id=resource_id, extractor=MANUAL_EXTRACTOR)
            self.session.add(record)
            created = True
        else:
            if command.expected_version is None:
                raise ResourceError("VERSION_REQUIRED", 428)
            if record.version != command.expected_version:
                raise ResourceError("VERSION_CONFLICT", 409, record.version)
            created = False
        record.format = command.format
        record.content = command.content
        record.char_count = len(command.content)
        record.sha256 = hashlib.sha256(command.content.encode("utf-8")).hexdigest()
        record.captured_at = utc_now()
        record.captured_from_url = command.captured_from_url
        record.extractor = MANUAL_EXTRACTOR
        record.status = "READY"
        record.failure_code = None
        self.session.flush()
        return project(record), created

    def delete(self, resource_id: UUID, expected: int) -> None:
        self.require_resource(resource_id)
        record = self.find(resource_id)
        if record is None:
            raise ResourceError("SNAPSHOT_NOT_FOUND", 404)
        if record.version != expected:
            raise ResourceError("VERSION_CONFLICT", 409, record.version)
        # Only the snapshot goes: the resource and everything else stay.
        self.session.delete(record)
        self.session.flush()
