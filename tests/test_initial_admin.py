"""Fresh-installation bootstrap is explicit, unique and requires a secret from the environment."""

import os

import pytest
from conftest import TEST_PASSWORD, send
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.cli import bootstrap_admin
from app.config import Settings
from app.main import create_app
from app.models import Employee, LeaveRequest
from app.security import verify_password

pytestmark = pytest.mark.postgres


def configure(monkeypatch, password=TEST_PASSWORD):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_USERNAME", "electropolis")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", password)
    monkeypatch.delenv("BOOTSTRAP_ADMIN_EMAIL", raising=False)


@pytest.mark.parametrize("length", [8, 12, 16, 256])
def test_bootstrap_without_email_creates_exactly_one_admin(database, monkeypatch, length):
    password = "x" * length
    configure(monkeypatch, password)
    assert not database.ready()
    result = bootstrap_admin(database)
    assert result == {"status": "administrator_created", "password_change_required": True}
    assert database.ready()
    with database.sessions() as db:
        users = list(db.scalars(select(Employee)))
        assert len(users) == 1
        user = users[0]
        assert user.username == "electropolis" and user.role == "admin" and user.active
        assert user.email is None and user.must_change_password
        assert verify_password(
            password, user.password_hash, user.password_salt, user.password_scheme
        )
        assert db.scalar(select(func.count()).select_from(LeaveRequest)) == 0
    with pytest.raises(ValueError, match="administrator already exists"):
        bootstrap_admin(database)
    with database.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Employee)) == 1


@pytest.mark.parametrize("password", ["", "x" * 7, "x" * 257])
def test_bootstrap_rejects_out_of_range_passwords_without_creating_an_account(
    database, monkeypatch, password
):
    assert not 8 <= len(password) <= 256
    configure(monkeypatch, password)
    with pytest.raises(ValueError, match="8 to 256 characters"):
        bootstrap_admin(database)
    with database.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Employee)) == 0


def test_bootstrap_requires_a_password_change_before_access(database, monkeypatch):
    configure(monkeypatch)
    bootstrap_admin(database)
    app = create_app(
        Settings(
            database_url=os.environ["TEST_DATABASE_URL"],
            database_ssl_mode="disable",
            environment="test",
            app_url="http://testserver",
            mail_enabled=False,
        )
    )
    with TestClient(app) as client:
        assert client.get("/").status_code == 200
        result = send(
            client,
            "POST",
            "/api/auth/login",
            json={
                "username": "electropolis",
                "password": TEST_PASSWORD,
            },
        )
        assert result.status_code == 200 and result.json()["user"]["mustChangePassword"]
        assert client.get("/api/bootstrap").status_code == 403
        changed = send(
            client,
            "POST",
            "/api/auth/change-password",
            json={
                "currentPassword": TEST_PASSWORD,
                "newPassword": "New-synthetic-password-only",
            },
        )
        assert changed.status_code == 200
        assert client.get("/api/bootstrap").status_code == 401
        logged_in = send(
            client,
            "POST",
            "/api/auth/login",
            json={
                "username": "electropolis",
                "password": "New-synthetic-password-only",
            },
        )
        assert logged_in.status_code == 200
        assert not logged_in.json()["user"]["mustChangePassword"]
        assert client.get("/api/bootstrap").status_code == 200


def test_initial_setup_never_removes_existing_users(database, employees, monkeypatch):
    configure(monkeypatch)
    with database.sessions() as db:
        for employee in db.scalars(select(Employee)):
            employee.role = "worker"
        db.commit()
    with pytest.raises(ValueError, match="empty installation"):
        bootstrap_admin(database)
    with database.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Employee)) == 6
