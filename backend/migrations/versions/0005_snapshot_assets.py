"""Freeze a snapshot's images as bytes in the controlled file directory.

The text alone is not a complete freeze: its images still point at the origin
site, so a redesign or a deleted file takes them with it. `content_snapshots`
cannot hold them (its content column is text) and `original_files` cannot either
(UNIQUE per resource, and its media-type allowlist has no image in it), so the
images get their own table, hanging off the snapshot rather than the resource —
replacing the text makes its images obsolete, and the CASCADE says exactly that.

The bytes live under the same private random-key storage as uploaded originals,
which is also what keeps them collectable: `FileRepository.references()` reads
this table, and the 24-hour orphan sweep removes anything it does not name.
"""

import sqlalchemy as sa
from alembic import op

revision = "0005_snapshot_assets"
down_revision = "0004_content_snapshots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "snapshot_assets",
        sa.Column("snapshot_id", sa.Uuid(), nullable=False),
        sa.Column("source_url", sa.String(length=2048), nullable=False),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column("media_type", sa.String(length=10), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "media_type IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')",
            name=op.f("ck_snapshot_assets_media_type"),
        ),
        sa.CheckConstraint(
            "length(sha256) BETWEEN 64 AND 64", name=op.f("ck_snapshot_assets_sha256_length")
        ),
        sa.CheckConstraint(
            "length(source_url) BETWEEN 1 AND 2048",
            name=op.f("ck_snapshot_assets_source_url_length"),
        ),
        sa.CheckConstraint(
            "length(storage_key) >= 1", name=op.f("ck_snapshot_assets_storage_key_nonempty")
        ),
        sa.CheckConstraint(
            "size_bytes BETWEEN 1 AND 10485760", name=op.f("ck_snapshot_assets_size_bounds")
        ),
        sa.ForeignKeyConstraint(
            ["snapshot_id"],
            ["content_snapshots.id"],
            name=op.f("fk_snapshot_assets_snapshot_id_content_snapshots"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_snapshot_assets")),
        sa.UniqueConstraint(
            "snapshot_id", "source_url", name=op.f("uq_snapshot_assets_snapshot_id")
        ),
        sa.UniqueConstraint("storage_key", name=op.f("uq_snapshot_assets_storage_key")),
        info={"owner": "resources"},
    )
    op.create_index(
        op.f("ix_snapshot_assets_snapshot_id"), "snapshot_assets", ["snapshot_id"], unique=False
    )


def downgrade() -> None:
    # Dropping the table discards the frozen images: their bytes stay in the
    # controlled directory as unreferenced orphans and are swept within 24 hours.
    # The origin addresses survive in the snapshot text, which is never rewritten.
    op.drop_index(op.f("ix_snapshot_assets_snapshot_id"), table_name="snapshot_assets")
    op.drop_table("snapshot_assets")
