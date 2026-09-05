"""Allow learning resources to be saved without a title (untitled quick saves).

SQLite cannot drop NOT NULL in place, so the column is rebuilt via
batch_alter_table. The existing `title_length` CHECK (length(title) BETWEEN
1 AND 200) is preserved unchanged: it still requires any non-NULL title to be
1..200 characters, and a NULL title passes it, which matches the new
"no title yet" semantics (title can be attached/cleared later).
"""

from alembic import op

revision = "0003_resource_title_nullable"
down_revision = "0002_note_optional_resource"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("learning_resources") as batch:
        batch.alter_column("title", nullable=True)


def downgrade() -> None:
    # A missing title cannot be invented on the way back: the NOT NULL rebuild
    # only succeeds when no untitled resource exists (mirrors 0002).
    with op.batch_alter_table("learning_resources") as batch:
        batch.alter_column("title", nullable=False)
