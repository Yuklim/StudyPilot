"""SQLAlchemy adapter for frozen snapshot assets; writes only the asset table.

Every read is scoped by the owning resource, so an asset id from one resource can
never be used to reach another's bytes.
"""

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from studypilot.modules.resources.assets import AssetBytes
from studypilot.modules.resources.contracts import ResourceError

from .models import ContentSnapshot, LearningResource, SnapshotAsset

FIELDS = (
    "id",
    "snapshot_id",
    "source_url",
    "media_type",
    "size_bytes",
    "sha256",
    "created_at",
)


def project(record: SnapshotAsset) -> dict[str, Any]:
    # `storage_key` is deliberately absent: an internal storage path is never
    # part of a response.
    return {field: getattr(record, field) for field in FIELDS}


class AssetStore:
    def __init__(self, session: Session) -> None:
        self.session = session

    def snapshot(self, resource_id: UUID) -> ContentSnapshot:
        """Resolve the snapshot the assets belong to, refusing in the usual order."""

        if self.session.get(LearningResource, resource_id) is None:
            raise ResourceError("RESOURCE_NOT_FOUND", 404)
        record = self.session.scalar(
            select(ContentSnapshot).where(ContentSnapshot.resource_id == resource_id)
        )
        if record is None:
            raise ResourceError("SNAPSHOT_NOT_FOUND", 404)
        return record

    def writable_snapshot(self, resource_id: UUID, expected: int) -> ContentSnapshot:
        """A write names the snapshot version the caller believes it is adding to.

        The version does not advance: an asset sits beside the text, it does not
        change it. The precondition only guarantees the image belongs to the copy
        of the text the caller was looking at.
        """

        record = self.snapshot(resource_id)
        if record.version != expected:
            raise ResourceError("VERSION_CONFLICT", 409, record.version)
        return record

    def listing(self, resource_id: UUID) -> list[dict[str, Any]]:
        record = self.snapshot(resource_id)
        rows = self.session.scalars(
            select(SnapshotAsset)
            .where(SnapshotAsset.snapshot_id == record.id)
            .order_by(SnapshotAsset.created_at, SnapshotAsset.id)
        )
        return [project(row) for row in rows]

    def by_source(self, snapshot_id: UUID, source_url: str) -> SnapshotAsset | None:
        return self.session.scalar(
            select(SnapshotAsset).where(
                SnapshotAsset.snapshot_id == snapshot_id,
                SnapshotAsset.source_url == source_url,
            )
        )

    def register(self, snapshot_id: UUID, source_url: str, content: AssetBytes) -> SnapshotAsset:
        record = SnapshotAsset(
            snapshot_id=snapshot_id,
            source_url=source_url,
            storage_key=content.storage_key,
            media_type=content.media_type,
            size_bytes=content.size_bytes,
            sha256=content.sha256,
        )
        self.session.add(record)
        self.session.flush()
        return record

    def get(self, resource_id: UUID, asset_id: UUID) -> SnapshotAsset:
        record = self.snapshot(resource_id)
        row = self.session.scalar(
            select(SnapshotAsset).where(
                SnapshotAsset.id == asset_id, SnapshotAsset.snapshot_id == record.id
            )
        )
        if row is None:
            # Same code and status whether the asset does not exist at all or
            # belongs to another resource: the answer must not distinguish them.
            raise ResourceError("SNAPSHOT_ASSET_NOT_FOUND", 404)
        return row

    def remove(self, resource_id: UUID, asset_id: UUID, expected: int) -> str:
        snapshot = self.writable_snapshot(resource_id, expected)
        row = self.session.scalar(
            select(SnapshotAsset).where(
                SnapshotAsset.id == asset_id, SnapshotAsset.snapshot_id == snapshot.id
            )
        )
        if row is None:
            raise ResourceError("SNAPSHOT_ASSET_NOT_FOUND", 404)
        key = row.storage_key
        self.session.delete(row)
        self.session.flush()
        return key

    def purge(self, snapshot_id: UUID) -> list[str]:
        """Drop every asset of one snapshot, returning the bytes left to isolate.

        Used when the frozen text is replaced or deleted: the old images belong to
        text that no longer exists. Deleting rows is not enough — the caller has to
        quarantine the returned keys, because CASCADE removes rows, never files.
        """

        rows = list(
            self.session.scalars(
                select(SnapshotAsset).where(SnapshotAsset.snapshot_id == snapshot_id)
            )
        )
        keys = [row.storage_key for row in rows]
        for row in rows:
            self.session.delete(row)
        self.session.flush()
        return keys
