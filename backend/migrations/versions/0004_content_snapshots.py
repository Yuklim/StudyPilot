"""Store a frozen Markdown copy of a resource's text beside its source URL.

A new table rather than a column on `learning_resources`: that table's
source-exclusivity CHECK requires a WEB resource to keep `pasted_content` NULL, and a
snapshot has to sit next to `source_url` without relaxing it. The snapshot is also not
an uploaded original — `original_files` is UNIQUE per resource and restricted to a
binary media-type allowlist, so it cannot carry this either.

READY rows hold the text; the FAILED shape is created now (unused by the task that
introduces this table) so a later automated capture can record "resource saved, but no
text" without a second migration.
"""

import sqlalchemy as sa
from alembic import op

revision = "0004_content_snapshots"
down_revision = "0003_resource_title_nullable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "content_snapshots",
        sa.Column("resource_id", sa.Uuid(), nullable=False),
        sa.Column("format", sa.String(length=8), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("char_count", sa.Integer(), nullable=True),
        sa.Column("sha256", sa.String(length=64), nullable=True),
        sa.Column("captured_at", sa.DateTime(), nullable=False),
        sa.Column("captured_from_url", sa.String(length=2048), nullable=True),
        sa.Column("extractor", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=6), nullable=False),
        sa.Column("failure_code", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "(status = 'READY' AND failure_code IS NULL AND content IS NOT NULL "
            "AND char_count IS NOT NULL AND sha256 IS NOT NULL) OR "
            "(status = 'FAILED' AND length(failure_code) > 0 AND content IS NULL "
            "AND char_count IS NULL AND sha256 IS NULL)",
            name=op.f("ck_content_snapshots_capture_state"),
        ),
        sa.CheckConstraint(
            "char_count IS NULL OR char_count BETWEEN 1 AND 1000000",
            name=op.f("ck_content_snapshots_char_count_bounds"),
        ),
        sa.CheckConstraint(
            "content IS NULL OR length(content) BETWEEN 1 AND 1000000",
            name=op.f("ck_content_snapshots_content_length"),
        ),
        sa.CheckConstraint(
            "length(extractor) BETWEEN 1 AND 80",
            name=op.f("ck_content_snapshots_extractor_length"),
        ),
        sa.CheckConstraint("format IN ('MARKDOWN')", name=op.f("ck_content_snapshots_format")),
        sa.CheckConstraint("version >= 1", name=op.f("ck_content_snapshots_positive_version")),
        sa.CheckConstraint(
            "sha256 IS NULL OR length(sha256) = 64",
            name=op.f("ck_content_snapshots_sha256_length"),
        ),
        sa.CheckConstraint(
            "status IN ('READY', 'FAILED')", name=op.f("ck_content_snapshots_status")
        ),
        sa.ForeignKeyConstraint(
            ["resource_id"],
            ["learning_resources.id"],
            name=op.f("fk_content_snapshots_resource_id_learning_resources"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_content_snapshots")),
        sa.UniqueConstraint("resource_id", name=op.f("uq_content_snapshots_resource_id")),
        info={"owner": "resources"},
    )


def downgrade() -> None:
    # Snapshots cannot be reconstructed from anywhere else: dropping the table
    # discards the frozen copies. That is the intended meaning of undoing this.
    op.drop_table("content_snapshots")
