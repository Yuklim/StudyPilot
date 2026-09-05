"""Allow notes to exist without an attached resource (standalone notes).

SQLite cannot drop NOT NULL in place, so the column is rebuilt via
batch_alter_table. The FK stays ondelete=CASCADE: it only ever cascades
attached rows, because NULL never matches a parent id.
"""

from alembic import op

revision = "0002_note_optional_resource"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("notes") as batch:
        batch.alter_column("resource_id", nullable=True)


def downgrade() -> None:
    # Standalone notes (NULL) cannot be meaningfully re-bound, so refuse on
    # data: downgrade is only allowed for the schema when no NULL rows exist.
    with op.batch_alter_table("notes") as batch:
        batch.alter_column("resource_id", nullable=False)
