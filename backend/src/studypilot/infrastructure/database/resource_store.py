"""SQLAlchemy resource storage/projections; sessions never leave this adapter.

Taxonomy operations validate references and create associations, never topics or
tags. Learning bootstrap inserts ONLY the already-approved database defaults;
there is deliberately no progress/state mutation method here.
"""

import hashlib
import json
import secrets
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session, defer

from studypilot.infrastructure.database.types import utc_now
from studypilot.modules.resources.contracts import (
    CreateResource,
    FileCreate,
    ResourceError,
    ResourcePatch,
    ResourceQuery,
    normalized_search,
)
from studypilot.modules.resources.files import FileStorage

from .models import (
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

RESOURCE_FIELDS = (
    "id",
    "title",
    "source_type",
    "source_name",
    "save_reason",
    "topic_id",
    "version",
    "created_at",
    "updated_at",
)
PROGRESS_FIELDS = (
    "resource_id",
    "status",
    "progress_percent",
    "started_at",
    "completed_at",
    "archived_from_status",
    "version",
    "updated_at",
)
TAG_FIELDS = ("id", "name", "version", "created_at", "updated_at")
PLAN_FIELDS = ("resource_id", "due_date", "status", "version", "created_at", "updated_at")
FILE_SUMMARY_FIELDS = ("id", "original_name", "size_bytes", "media_type", "status")
FILE_FIELDS = (
    *FILE_SUMMARY_FIELDS,
    "resource_id",
    "sha256",
    "failure_code",
    "version",
    "created_at",
    "updated_at",
)
DELETION_IMPACT_KEYS = (
    "original_file_count",
    "note_count",
    "study_record_count",
    "active_review_plan_count",
    "review_record_count",
    "resource_tag_count",
)


def project(record: object | None, fields: tuple[str, ...]) -> dict[str, Any] | None:
    return {field: getattr(record, field) for field in fields} if record is not None else None


class ResourceStore:
    def __init__(self, session: Session) -> None:
        self._session = session

    def validate_taxonomy(self, topic_id: UUID | None, tag_ids: list[UUID]) -> None:
        if topic_id is not None and self._session.get(Topic, topic_id) is None:
            raise ResourceError("TOPIC_NOT_FOUND", 404)
        found = set(self._session.scalars(select(Tag.id).where(Tag.id.in_(tag_ids))))
        if found != set(tag_ids):
            raise ResourceError("TAG_NOT_FOUND", 404)

    def insert_resource(self, command: CreateResource | FileCreate) -> UUID:
        resource = LearningResource(**command.model_dump(exclude={"tag_ids"}))
        self._session.add(resource)
        self._session.flush()
        return resource.id

    def initialize_progress(self, resource_id: UUID) -> None:
        # No caller-supplied learning state: reuse TASK-005 defaults exactly.
        self._session.add(LearningProgress(resource_id=resource_id))
        self._session.flush()

    def attach_tags(self, resource_id: UUID, tag_ids: list[UUID]) -> None:
        self._session.add_all(ResourceTag(resource_id=resource_id, tag_id=tag) for tag in tag_ids)
        self._session.flush()

    def _projections(
        self, resources: list[LearningResource], *, detail: bool = False
    ) -> list[dict[str, Any]]:
        ids = [resource.id for resource in resources]
        if not ids:
            return []
        progress = {
            row.resource_id: row
            for row in self._session.scalars(
                select(LearningProgress).where(LearningProgress.resource_id.in_(ids))
            )
        }
        plans = {
            row.resource_id: row
            for row in self._session.scalars(
                select(ActiveReviewPlan).where(ActiveReviewPlan.resource_id.in_(ids))
            )
        }
        files = {
            row.resource_id: row
            for row in self._session.scalars(
                select(OriginalFile).where(OriginalFile.resource_id.in_(ids))
            )
        }
        tags: dict[UUID, list[dict[str, Any] | None]] = {key: [] for key in ids}
        for resource_id, tag in self._session.execute(
            select(ResourceTag.resource_id, Tag)
            .join(Tag, Tag.id == ResourceTag.tag_id)
            .where(ResourceTag.resource_id.in_(ids))
            .order_by(Tag.name, Tag.id)
        ):
            tags[resource_id].append(project(tag, TAG_FIELDS))
        result = []
        for resource in resources:
            # A visible resource missing its required projection is corrupt, not
            # a fabricated UNREAD record; let the API return a sanitized error.
            if resource.id not in progress:
                raise ResourceError("UNKNOWN_ERROR", 500)
            row = {field: getattr(resource, field) for field in RESOURCE_FIELDS}
            row.update(
                progress=project(progress[resource.id], PROGRESS_FIELDS),
                tags=tags[resource.id],
                review_plan=project(plans.get(resource.id), PLAN_FIELDS),
                original_file=project(
                    files.get(resource.id), FILE_FIELDS if detail else FILE_SUMMARY_FIELDS
                )
                if resource.source_type == "FILE"
                else None,
            )
            if detail:
                if resource.source_type == "WEB":
                    row["source_url"] = resource.source_url
                elif resource.source_type == "PASTE":
                    row["pasted_content"] = resource.pasted_content
            result.append(row)
        return result

    def find(self, resource_id: UUID) -> LearningResource:
        resource = self._session.get(LearningResource, resource_id)
        if resource is None:
            raise ResourceError("RESOURCE_NOT_FOUND", 404)
        if resource.source_type == "FILE":
            ready = self._session.scalar(
                select(OriginalFile.id).where(
                    OriginalFile.resource_id == resource_id, OriginalFile.status == "READY"
                )
            )
            if ready is None:
                raise ResourceError("RESOURCE_NOT_FOUND", 404)
        return resource

    @staticmethod
    def check_version(resource: LearningResource, expected: int) -> None:
        if resource.version != expected:
            raise ResourceError("VERSION_CONFLICT", 409, resource.version)

    def update(self, resource_id: UUID, command: ResourcePatch) -> dict[str, Any]:
        resource = self.find(resource_id)
        self.check_version(resource, command.expected_version)
        changes = command.model_dump(exclude_unset=True, exclude={"expected_version"})
        for field, source in (("source_url", "WEB"), ("pasted_content", "PASTE")):
            if field in changes and resource.source_type != source:
                raise ResourceError("SOURCE_TYPE_MISMATCH", 409)
        if "topic_id" in changes:
            self.validate_taxonomy(command.topic_id, [])
        for field, value in changes.items():
            if getattr(resource, field) != value:
                setattr(resource, field, value)
        # Existing ORM version guard also protects the actual UPDATE, not just this read.
        self._session.flush()
        return self._projections([resource], detail=True)[0]

    def detail(self, resource_id: UUID) -> dict[str, Any]:
        resource = self.find(resource_id)
        return self._projections([resource], detail=True)[0]

    @staticmethod
    def _stamp(value: datetime) -> str:
        return value.isoformat().replace("+00:00", "Z")

    @staticmethod
    def _digest_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @staticmethod
    def _revision(manifest: dict[str, Any]) -> str:
        payload = json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _deletion_snapshot(self, resource_id: UUID) -> dict[str, Any]:
        resource = self.find(resource_id)
        originals = list(
            self._session.scalars(
                select(OriginalFile)
                .where(OriginalFile.resource_id == resource_id)
                .order_by(OriginalFile.id)
            )
        )
        notes = list(
            self._session.scalars(
                select(Note).where(Note.resource_id == resource_id).order_by(Note.id)
            )
        )
        progress = self._session.get(LearningProgress, resource_id)
        study_records = list(
            self._session.scalars(
                select(StudyRecord)
                .where(StudyRecord.resource_id == resource_id)
                .order_by(StudyRecord.created_at, StudyRecord.id)
            )
        )
        plan = self._session.get(ActiveReviewPlan, resource_id)
        review_records = list(
            self._session.scalars(
                select(ReviewRecord)
                .where(ReviewRecord.resource_id == resource_id)
                .order_by(ReviewRecord.created_at, ReviewRecord.id)
            )
        )
        tags = list(
            self._session.scalars(
                select(ResourceTag)
                .where(ResourceTag.resource_id == resource_id)
                .order_by(ResourceTag.tag_id)
            )
        )
        manifest = {
            "resource": {"id": str(resource.id), "version": resource.version},
            "original_files": [
                {
                    "id": str(row.id),
                    "version": row.version,
                    "status": row.status,
                    "storage_key": row.storage_key,
                }
                for row in originals
            ],
            "learning_progress": []
            if progress is None
            else [{"resource_id": str(progress.resource_id), "version": progress.version}],
            "notes": [{"id": str(row.id), "version": row.version} for row in notes],
            "study_records": [
                {"id": str(row.id), "created_at": self._stamp(row.created_at)}
                for row in study_records
            ],
            "active_review_plans": []
            if plan is None
            else [{"resource_id": str(plan.resource_id), "version": plan.version}],
            "review_records": [
                {"id": str(row.id), "created_at": self._stamp(row.created_at)}
                for row in review_records
            ],
            "resource_tags": [
                {"tag_id": str(row.tag_id), "association_version": row.association_version}
                for row in tags
            ],
        }
        impact = {key: 0 for key in DELETION_IMPACT_KEYS}
        impact.update(
            original_file_count=len(originals),
            note_count=len(notes),
            study_record_count=len(study_records),
            active_review_plan_count=0 if plan is None else 1,
            review_record_count=len(review_records),
            resource_tag_count=len(tags),
        )
        revision = self._revision(manifest)
        current_impact = {
            "resource_id": str(resource.id),
            "resource_version": resource.version,
            "impact_revision": revision,
            "impact": impact,
        }
        return {
            "resource": resource,
            "manifest": manifest,
            "revision": revision,
            "impact": impact,
            "current_impact": current_impact,
            "storage_keys": [row.storage_key for row in originals if row.status == "READY"],
        }

    def preview_deletion(self, resource_id: UUID) -> dict[str, Any]:
        snapshot = self._deletion_snapshot(resource_id)
        token = secrets.token_urlsafe(32)
        expires = utc_now() + timedelta(minutes=5)
        self._session.add(
            DeletionConfirmation(
                resource_id=resource_id,
                resource_version=snapshot["resource"].version,
                token_digest=self._digest_token(token),
                impact_manifest=snapshot["manifest"],
                impact_revision=snapshot["revision"],
                expires_at=expires,
                used_at=None,
            )
        )
        self._session.flush()
        return {
            "resource_id": str(resource_id),
            "resource_version": snapshot["resource"].version,
            "impact_revision": snapshot["revision"],
            "expires_at": expires,
            "confirmation_token": token,
            "impact": snapshot["impact"],
        }

    def delete_resource(
        self, resource_id: UUID, token: str, storage: FileStorage
    ) -> dict[str, Any]:
        confirmation = self._session.scalar(
            select(DeletionConfirmation).where(
                DeletionConfirmation.token_digest == self._digest_token(token)
            )
        )
        if confirmation is None or confirmation.resource_id != resource_id:
            raise ResourceError("DELETION_TOKEN_INVALID", 403)
        if confirmation.used_at is not None:
            raise ResourceError("DELETION_TOKEN_REPLAYED", 409)
        now = utc_now()
        if confirmation.expires_at <= now:
            raise ResourceError("DELETION_TOKEN_EXPIRED", 410)
        snapshot = self._deletion_snapshot(resource_id)
        if (
            confirmation.resource_version != snapshot["resource"].version
            or confirmation.impact_revision != snapshot["revision"]
            or confirmation.impact_manifest != snapshot["manifest"]
        ):
            confirmation.used_at = now
            self._session.flush()
            return {
                "error": "DELETION_IMPACT_CHANGED",
                "current_impact": snapshot["current_impact"],
            }
        for key in snapshot["storage_keys"]:
            storage.quarantine(key)
        confirmation.used_at = now
        self._session.delete(snapshot["resource"])
        self._session.flush()
        return {}

    def page(self, query: ResourceQuery) -> dict[str, Any]:
        statement = (
            select(LearningResource)
            .join(LearningProgress, LearningProgress.resource_id == LearningResource.id)
            .options(defer(LearningResource.pasted_content), defer(LearningResource.source_url))
        )
        ready_file = (
            select(OriginalFile.id)
            .where(OriginalFile.resource_id == LearningResource.id, OriginalFile.status == "READY")
            .exists()
        )
        statement = statement.where(or_(LearningResource.source_type != "FILE", ready_file))
        if query.learning_status:
            statement = statement.where(LearningProgress.status.in_(query.learning_status))
        else:
            statement = statement.where(LearningProgress.status != "ARCHIVED")
        if query.source_type:
            statement = statement.where(LearningResource.source_type.in_(query.source_type))
        if query.topic_id is not None:
            statement = statement.where(LearningResource.topic_id == query.topic_id)
        if query.topic_unassigned:
            statement = statement.where(LearningResource.topic_id.is_(None))
        for tag in set(query.tag_id):
            statement = statement.where(
                select(ResourceTag.resource_id)
                .where(ResourceTag.resource_id == LearningResource.id, ResourceTag.tag_id == tag)
                .exists()
            )
        if query.progress_min is not None:
            statement = statement.where(LearningProgress.progress_percent >= query.progress_min)
        if query.progress_max is not None:
            statement = statement.where(LearningProgress.progress_percent <= query.progress_max)
        for column, start, end in (
            (LearningResource.created_at, query.created_from, query.created_to),
            (LearningResource.updated_at, query.updated_from, query.updated_to),
        ):
            if start is not None:
                statement = statement.where(column >= start)
            if end is not None:
                statement = statement.where(column < end)
        sort_columns = {
            "created_at": LearningResource.created_at,
            "updated_at": LearningResource.updated_at,
            "title": LearningResource.title,
            "progress_percent": LearningProgress.progress_percent,
        }
        order_column = sort_columns[query.sort.lstrip("-")]
        ordering: list[ColumnElement[Any]] = [
            order_column.desc() if query.sort.startswith("-") else order_column.asc(),
            LearningResource.id.asc(),
        ]
        # Untitled (NULL) resources always sort after titled ones, ascending or
        # descending, per the documented contract; never trust the DB's default
        # NULL ordering here.
        if query.sort.lstrip("-") == "title":
            ordering.insert(0, LearningResource.title.is_(None))
        statement = statement.order_by(*ordering)
        # Unicode NFKC/casefold matching stays portable, without SQLite-only SQL.
        # Only bounded metadata is loaded; large source content is deferred.
        offset = (query.page - 1) * query.page_size
        if query.q is None:
            total = (
                self._session.scalar(
                    select(func.count()).select_from(statement.order_by(None).subquery())
                )
                or 0
            )
            selected = list(self._session.scalars(statement.offset(offset).limit(query.page_size)))
        else:
            matches = list(self._session.scalars(statement))
            needle = normalized_search(query.q)
            matches = [
                row
                for row in matches
                if any(
                    needle in normalized_search(value or "")
                    for value in (row.title, row.source_name, row.save_reason)
                )
            ]
            total = len(matches)
            selected = matches[offset : offset + query.page_size]
        return {
            "data": self._projections(selected),
            "page": {
                "number": query.page,
                "size": query.page_size,
                "total_items": total,
                "total_pages": (total + query.page_size - 1) // query.page_size,
                "has_more": offset + query.page_size < total,
            },
        }
