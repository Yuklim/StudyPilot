"""Let a highlight anchor into one page of a PDF (TASK-089).

Until now a highlight could only live in a resource's frozen Markdown text: the
anchor's offsets counted characters of that one snapshot. A PDF has no snapshot;
what it has is a text layer per page, so a highlight made there needs to say
*which page* its `exact`/`prefix`/`suffix`/offsets are measured in. That is the
new nullable `page_number` (1-based, like pdf.js and the reader's own position
memory): NULL keeps meaning "in the snapshot", a value means "in that page".

Nothing else about anchoring changes - the layered anchor and the reader-side
re-location are the same on a page as they were on an article. The server still
never reads the PDF, so it does not check the page exists; an out-of-range page
just fails to locate in the reader, the same way a passage that was edited away
does.

SQLite cannot add a CHECK or rebuild an index in place, so the table is
rebuilt via batch_alter_table (the same route 0006 took). Rows, the FKs and the
note UNIQUE are preserved. The reading-order index now leads with the page so a
PDF's highlights list in page order, snapshot highlights (NULL) first.
"""

import sqlalchemy as sa
from alembic import op

revision = "0009_highlight_page"
down_revision = "0008_resource_citations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("highlights") as batch:
        batch.add_column(sa.Column("page_number", sa.Integer(), nullable=True))
        batch.create_check_constraint(
            "page_number_positive", "page_number IS NULL OR page_number >= 1"
        )
        batch.drop_index("ix_highlights_resource_start")
        batch.create_index(
            "ix_highlights_resource_start",
            ["resource_id", "page_number", "start_offset", "id"],
        )


def downgrade() -> None:
    # A highlight made on a PDF page has nowhere to go below 0009 - dropping the
    # column would silently turn it into a snapshot anchor pointing at nothing.
    # Refuse while any exists, the way 0006 refuses to truncate notes.
    marked = op.get_bind().scalar(
        sa.text("SELECT count(*) FROM highlights WHERE page_number IS NOT NULL")
    )
    if marked:
        raise RuntimeError(f"cannot downgrade: {marked} highlight(s) are anchored in PDF pages")
    with op.batch_alter_table("highlights") as batch:
        batch.drop_index("ix_highlights_resource_start")
        batch.create_index("ix_highlights_resource_start", ["resource_id", "start_offset", "id"])
        batch.drop_constraint("page_number_positive", type_="check")
        batch.drop_column("page_number")
