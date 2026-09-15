"""Widen the note content ceiling from 50,000 to 2,000,000 characters (TASK-063).

Images are pasted into notes as base64 data URIs inside the Markdown, so the
original CHECK (`length(content) BETWEEN 1 AND 50000`, named
`ck_notes_content_length` in 0001) would reject any note holding one. SQLite
cannot alter a CHECK in place, so the table is rebuilt via batch_alter_table;
the named CHECK is reflected from the CREATE TABLE text, dropped by its short
name (the metadata naming convention adds the `ck_notes_` prefix) and re-created
with the new bound. Rows, indexes and the FK are preserved.
"""

import sqlalchemy as sa
from alembic import op

revision = "0006_note_content_limit"
down_revision = "0005_snapshot_assets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("notes") as batch:
        batch.drop_constraint("content_length", type_="check")
        batch.create_check_constraint("content_length", "length(content) BETWEEN 1 AND 2000000")


def downgrade() -> None:
    # Content over the old ceiling cannot be shortened on the way back: refuse
    # while any such note exists, so the rebuild never loses or truncates data.
    over = op.get_bind().scalar(sa.text("SELECT count(*) FROM notes WHERE length(content) > 50000"))
    if over:
        raise RuntimeError(f"cannot downgrade: {over} note(s) exceed 50000 characters")
    with op.batch_alter_table("notes") as batch:
        batch.drop_constraint("content_length", type_="check")
        batch.create_check_constraint("content_length", "length(content) BETWEEN 1 AND 50000")
