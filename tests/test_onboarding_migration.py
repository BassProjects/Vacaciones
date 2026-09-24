"""Upgrade/downgrade checks only against the disposable PostgreSQL fixture."""

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, select, text

from app.cli import migrate
from app.db import audit
from app.models import Employee

pytestmark = pytest.mark.postgres


def downgrade_to_initial(database):
    configuration = Config("alembic.ini")
    with database.engine.begin() as connection:
        configuration.attributes["connection"] = connection
        command.downgrade(configuration, "0001_python")


def test_upgrade_preserves_working_accounts_and_only_marks_unused_invitations(database, employees):
    with database.sessions() as db:
        for username in ("worker", "coworker", "delegate"):
            user = db.get(Employee, "test-" + username)
            user.must_change_password = True
            audit(db, None, "employee.invited", user.id)
        db.get(Employee, "test-delegate").active = False
        audit(db, db.get(Employee, "test-coworker"), "auth.login", "test-coworker")
        db.commit()
        original = {
            e.id: (e.password_hash, e.password_salt, e.name, e.active)
            for e in db.scalars(select(Employee))
        }
    downgrade_to_initial(database)
    assert "onboarding_pending" not in {
        c["name"] for c in inspect(database.engine).get_columns("employees")
    }
    assert migrate(database)["revision"] == "0002_onboarding"
    assert migrate(database)["revision"] == "0002_onboarding"
    with database.sessions() as db:
        for e in db.scalars(select(Employee)):
            assert (e.password_hash, e.password_salt, e.name, e.active) == original[e.id]
            assert e.onboarding_pending is (e.id in {"test-worker", "test-delegate"})
    assert database.ready()


def test_controlled_downgrade_cannot_activate_an_unregistered_account(database, employees):
    with database.sessions() as db:
        user = db.get(Employee, "test-worker")
        user.onboarding_pending = True
        original_hash = user.password_hash
        db.commit()
    downgrade_to_initial(database)
    with database.engine.connect() as connection:
        row = connection.execute(
            text("SELECT active, password_hash FROM employees WHERE id = 'test-worker' ")
        ).one()
        assert row.active is False and row.password_hash == original_hash
    assert "employee_activations" not in inspect(database.engine).get_table_names()
    migrate(database)
    with database.sessions() as db:
        assert not db.get(Employee, "test-worker").active
