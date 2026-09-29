"""Give a highlight a look: mark or underline, in one of four colours (TASK-093).

Until now every highlight was painted the same way. The annotation toolbar the
user asked for (2026-09-26) has a highlighter with several colours, an underline
tool, and lets an existing mark be recoloured or turned into an underline - so
the look has to be stored with the anchor. Two small enumerated columns, both
NOT NULL with a default, so every existing row keeps looking exactly as it did
(`mark` in `yellow`, the one look there was).

The anchor and the note binding are untouched. SQLite cannot add a CHECK in
place, so the table is rebuilt via batch_alter_table like 0009; rows, FKs, the
note UNIQUE and the reading-order index are preserved.
"""

import sqlalchemy as sa
from alembic import op

revision = "0010_highlight_style"
down_revision = "0009_highlight_page"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("highlights") as batch:
        batch.add_column(sa.Column("style", sa.String(16), nullable=False, server_default="mark"))
        batch.add_column(sa.Column("color", sa.String(16), nullable=False, server_default="yellow"))
        batch.create_check_constraint("style_known", "style IN ('mark', 'underline')")
        batch.create_check_constraint("color_known", "color IN ('yellow', 'green', 'blue', 'pink')")


def downgrade() -> None:
    # Below 0010 a highlight can only be a yellow mark. Dropping the columns would
    # silently repaint every underline and every other colour; refuse while any
    # such row exists, the way 0009 refuses to drop page anchors.
    styled = op.get_bind().scalar(
        sa.text("SELECT count(*) FROM highlights WHERE style != 'mark' OR color != 'yellow'")
    )
    if styled:
        raise RuntimeError(
            f"cannot downgrade: {styled} highlight(s) carry a style or colour 0009 cannot keep"
        )
    with op.batch_alter_table("highlights") as batch:
        batch.drop_constraint("color_known", type_="check")
        batch.drop_constraint("style_known", type_="check")
        batch.drop_column("color")
        batch.drop_column("style")
