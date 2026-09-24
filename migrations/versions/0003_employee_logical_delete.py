"""Logical employee deletion while preserving business history.

Revision ID: 0003_employee_logical_delete
Revises: 0002_onboarding
"""

import sqlalchemy as sa
from alembic import op

revision = "0003_employee_logical_delete"
down_revision = "0002_onboarding"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "employees",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_employees_deleted_at", "employees", ["deleted_at"])


def downgrade():
    # Deleted accounts remain inactive/tombstoned if this metadata column is removed.
    op.drop_index("ix_employees_deleted_at", table_name="employees")
    op.drop_column("employees", "deleted_at")
