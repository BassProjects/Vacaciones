"""Separate employee activation from account suspension; preserve existing accounts.

Revision ID: 0002_onboarding
Revises: 0001_python
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_onboarding"
down_revision = "0001_python"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "employees",
        sa.Column("onboarding_pending", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "employee_activations",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(80), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_employee_activations_user_id", "employee_activations", ["user_id"])
    # Only invitations that have never been used become pending registration.
    # Do not touch passwords, active/suspended status, working accounts or audit events.
    op.execute("""
        UPDATE employees AS e SET onboarding_pending = true
        WHERE e.must_change_password = true
          AND EXISTS (SELECT 1 FROM audit_events AS a
                      WHERE a.entity_id = e.id AND a.action = 'employee.invited')
          AND NOT EXISTS (SELECT 1 FROM audit_events AS a
                          WHERE (a.actor_id = e.id AND a.action = 'auth.login')
                             OR (a.entity_id = e.id AND a.action IN
                                 ('auth.password_changed', 'auth.password_reset')))
    """)


def downgrade():
    # A rollback must not turn an unregistered account into a usable one.
    op.execute("UPDATE employees SET active = false WHERE onboarding_pending = true")
    op.drop_index("ix_employee_activations_user_id", table_name="employee_activations")
    op.drop_table("employee_activations")
    op.drop_column("employees", "onboarding_pending")
