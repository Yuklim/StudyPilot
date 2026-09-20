"""SQLAlchemy adapter for a resource's citation; writes only the citation table.

The resource is a read-only prerequisite, checked with the same visibility rule
the notes store uses (a FILE resource counts only once its original is READY).
Nothing here reads the snapshot, the notes or the learning data, and nothing
here reaches the network: a DOI is a string the caller supplied.
"""

from typing import Any
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from studypilot.modules.citations.contracts import CitationError, CitationPut

from .models import LearningResource, OriginalFile, ResourceCitation

FIELDS = (
    "id",
    "resource_id",
    "item_type",
    "authors",
    "issued_year",
    "issued_date",
    "container_title",
    "volume",
    "issue",
    "pages",
    "publisher",
    "doi",
    "isbn",
    "abstract",
    "version",
    "created_at",
    "updated_at",
)
# Everything a caller may write. `expected_version` is a precondition, not a
# stored value, so it is excluded before the record is rewritten.
PRECONDITION = {"expected_version"}


def project(record: ResourceCitation) -> dict[str, Any]:
    return {field: getattr(record, field) for field in FIELDS}


class CitationStore:
    def __init__(self, session: Session) -> None:
        self.session = session

    def require_resource(self, resource_id: UUID) -> None:
        """Readable resource, same rule the notes store applies."""
        ready = (
            select(OriginalFile.id)
            .where(OriginalFile.resource_id == LearningResource.id, OriginalFile.status == "READY")
            .exists()
        )
        if (
            self.session.scalar(
                select(LearningResource.id).where(
                    LearningResource.id == resource_id,
                    or_(LearningResource.source_type != "FILE", ready),
                )
            )
            is None
        ):
            raise CitationError("RESOURCE_NOT_FOUND", 404)

    def find(self, resource_id: UUID) -> ResourceCitation | None:
        return self.session.scalar(
            select(ResourceCitation).where(ResourceCitation.resource_id == resource_id)
        )

    @staticmethod
    def check_version(record: ResourceCitation, expected: int) -> None:
        if record.version != expected:
            raise CitationError("VERSION_CONFLICT", 409, {"current_version": record.version})

    def detail(self, resource_id: UUID) -> dict[str, Any]:
        self.require_resource(resource_id)
        record = self.find(resource_id)
        if record is None:
            raise CitationError("CITATION_NOT_FOUND", 404)
        return project(record)

    def put(self, resource_id: UUID, command: CitationPut) -> tuple[dict[str, Any], bool]:
        """Whole-record replacement: a field the caller left out is cleared."""
        self.require_resource(resource_id)
        record = self.find(resource_id)
        if record is None:
            if command.expected_version is not None:
                # The caller believes it is replacing something that is not there.
                raise CitationError("CITATION_NOT_FOUND", 404)
            record = ResourceCitation(resource_id=resource_id)
            self.session.add(record)
            created = True
        else:
            if command.expected_version is None:
                raise CitationError("VERSION_REQUIRED", 428)
            self.check_version(record, command.expected_version)
            created = False
        for field, value in command.model_dump(exclude=PRECONDITION).items():
            # Assigning an equal value would still mark the row dirty and bump
            # version_id_col, so an unchanged rewrite must touch nothing.
            if getattr(record, field) != value:
                setattr(record, field, value)
        self.session.flush()
        return project(record), created

    def delete(self, resource_id: UUID, expected: int) -> None:
        self.require_resource(resource_id)
        record = self.find(resource_id)
        if record is None:
            raise CitationError("CITATION_NOT_FOUND", 404)
        self.check_version(record, expected)
        # Only the citation goes: the resource and everything else stay.
        self.session.delete(record)
        self.session.flush()
