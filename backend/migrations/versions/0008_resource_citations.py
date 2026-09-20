"""Record what a saved work *is*: its authors, year, venue and identifiers.

Until now a saved resource carried only title, address, source name, save reason,
topic and tags. A paper's authors, year, journal and DOI had nowhere to go but
the free-text "save reason" or a tag, where nothing can be searched by structure
and nothing can later be exported as a citation.

A new table rather than columns on `learning_resources`: that table is the "how
do I get back to this" record and every row fills every column, while
bibliographic metadata is absent for most saved pages, arrives as a block rather
than field by field, and is replaced wholesale rather than patched. One row per
resource (`UNIQUE(resource_id)`), cascading with it.

`authors` is a JSON array because the order of authors is part of the citation
and a join table would buy ordering-by-position at the cost of a second write
path; nothing sorts or searches by author yet, so no index. The identifiers are
stored exactly as given - the server never resolves a DOI and makes no outbound
request.
"""

import sqlalchemy as sa
from alembic import op

revision = "0008_resource_citations"
down_revision = "0007_highlights"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "resource_citations",
        sa.Column("resource_id", sa.Uuid(), nullable=False),
        sa.Column("item_type", sa.String(length=16), server_default="OTHER", nullable=False),
        sa.Column("authors", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("issued_year", sa.Integer(), nullable=True),
        sa.Column("issued_date", sa.String(length=32), nullable=True),
        sa.Column("container_title", sa.String(length=500), nullable=True),
        sa.Column("volume", sa.String(length=50), nullable=True),
        sa.Column("issue", sa.String(length=50), nullable=True),
        sa.Column("pages", sa.String(length=50), nullable=True),
        sa.Column("publisher", sa.String(length=200), nullable=True),
        sa.Column("doi", sa.String(length=200), nullable=True),
        sa.Column("isbn", sa.String(length=32), nullable=True),
        sa.Column("abstract", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "length(abstract) BETWEEN 1 AND 20000",
            name=op.f("ck_resource_citations_abstract_length"),
        ),
        sa.CheckConstraint(
            "length(container_title) BETWEEN 1 AND 500",
            name=op.f("ck_resource_citations_container_title_length"),
        ),
        sa.CheckConstraint(
            "length(doi) BETWEEN 1 AND 200", name=op.f("ck_resource_citations_doi_length")
        ),
        sa.CheckConstraint(
            "length(isbn) BETWEEN 1 AND 32", name=op.f("ck_resource_citations_isbn_length")
        ),
        sa.CheckConstraint(
            "length(issue) BETWEEN 1 AND 50", name=op.f("ck_resource_citations_issue_length")
        ),
        sa.CheckConstraint(
            "length(issued_date) BETWEEN 1 AND 32",
            name=op.f("ck_resource_citations_issued_date_length"),
        ),
        sa.CheckConstraint(
            "issued_year IS NULL OR issued_year BETWEEN 1000 AND 2200",
            name=op.f("ck_resource_citations_issued_year_bounds"),
        ),
        sa.CheckConstraint(
            "item_type IN ('JOURNAL_ARTICLE', 'PREPRINT', 'CONFERENCE_PAPER', 'BOOK', "
            "'BOOK_CHAPTER', 'THESIS', 'REPORT', 'WEBPAGE', 'OTHER')",
            name=op.f("ck_resource_citations_item_type"),
        ),
        sa.CheckConstraint(
            "length(pages) BETWEEN 1 AND 50", name=op.f("ck_resource_citations_pages_length")
        ),
        sa.CheckConstraint(
            "length(publisher) BETWEEN 1 AND 200",
            name=op.f("ck_resource_citations_publisher_length"),
        ),
        sa.CheckConstraint("version >= 1", name=op.f("ck_resource_citations_positive_version")),
        sa.CheckConstraint(
            "length(volume) BETWEEN 1 AND 50", name=op.f("ck_resource_citations_volume_length")
        ),
        sa.ForeignKeyConstraint(
            ["resource_id"],
            ["learning_resources.id"],
            name=op.f("fk_resource_citations_resource_id_learning_resources"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_resource_citations")),
        sa.UniqueConstraint("resource_id", name=op.f("uq_resource_citations_resource_id")),
        info={"owner": "resources"},
    )


def downgrade() -> None:
    """Drops the table outright: going back below 0008 discards the citations.

    There is nowhere else to put them - no earlier schema has a field for an
    author list or a DOI - so undoing this migration is a decision to lose what
    was recorded, the same shape 0004, 0005 and 0007 take. The resources and
    their titles, addresses, notes and highlights are untouched.
    """
    op.drop_table("resource_citations")
