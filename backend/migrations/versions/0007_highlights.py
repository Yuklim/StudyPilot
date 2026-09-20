"""Keep the passages a reader marked, anchored so they survive the text moving.

A highlight is the first piece of reading that the project stores as its own
object: until now the only trace of "this paragraph matters" was the text a user
copied into a note, which leaves the article itself unmarked.

Anchoring is the whole difficulty (docs/research 5.1). A character range alone
breaks as soon as anything above it changes, and a DOM path breaks when the
renderer changes, so each row carries the marked text with its surrounding
context and keeps the offsets only as a fallback. Re-locating is the reader's
job at render time; nothing here interprets the snapshot.

`note_id` is the optional note written about the passage - on this side so the
notes table is untouched, and SET NULL so deleting what you wrote never deletes
the passage you marked. The resource FK cascades: deleting a resource takes its
highlights, and the deletion preview counts them before asking.
"""

import sqlalchemy as sa
from alembic import op

revision = "0007_highlights"
down_revision = "0006_note_content_limit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "highlights",
        sa.Column("resource_id", sa.Uuid(), nullable=False),
        sa.Column("exact", sa.Text(), nullable=False),
        sa.Column("prefix", sa.String(length=200), nullable=True),
        sa.Column("suffix", sa.String(length=200), nullable=True),
        sa.Column("start_offset", sa.Integer(), nullable=False),
        sa.Column("end_offset", sa.Integer(), nullable=False),
        sa.Column("note_id", sa.Uuid(), nullable=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "length(exact) BETWEEN 1 AND 2000", name=op.f("ck_highlights_exact_length")
        ),
        sa.CheckConstraint(
            "prefix IS NULL OR length(prefix) <= 200", name=op.f("ck_highlights_prefix_length")
        ),
        sa.CheckConstraint(
            "suffix IS NULL OR length(suffix) <= 200", name=op.f("ck_highlights_suffix_length")
        ),
        sa.CheckConstraint(
            "start_offset >= 0 AND end_offset > start_offset",
            name=op.f("ck_highlights_offset_order"),
        ),
        sa.CheckConstraint("version >= 1", name=op.f("ck_highlights_positive_version")),
        sa.ForeignKeyConstraint(
            ["note_id"],
            ["notes.id"],
            name=op.f("fk_highlights_note_id_notes"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["resource_id"],
            ["learning_resources.id"],
            name=op.f("fk_highlights_resource_id_learning_resources"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_highlights")),
        sa.UniqueConstraint("note_id", name=op.f("uq_highlights_note_id")),
    )
    op.create_index(
        "ix_highlights_resource_start", "highlights", ["resource_id", "start_offset", "id"]
    )


def downgrade() -> None:
    """Drops the table outright: going back below 0007 means the highlights go.

    There is nowhere to put them - every earlier schema has no place for an
    anchor - so a downgrade is a decision to discard what was marked, the same
    shape 0004 and 0005 take for snapshots and their images.
    """
    op.drop_index("ix_highlights_resource_start", table_name="highlights")
    op.drop_table("highlights")
