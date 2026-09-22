"""All integration data is synthetic and lives in a supervised local PostgreSQL 16."""

import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import make_url

from app.cli import migrate
from app.config import Settings
from app.db import Database
from app.main import create_app
from app.models import Employee
from app.security import CSRF_COOKIE, hash_password

TEST_PASSWORD = "Synthetic-Only-Password-2026"


@pytest.fixture
def database():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Run scripts/with_test_postgres.py for isolated PostgreSQL integration")
    parsed = make_url(url)
    if (
        os.environ.get("TEST_DATABASE_SUPERVISED") != "vacaciones-pg16"
        or parsed.host != "127.0.0.1"
        or parsed.database != "vacaciones_test"
    ):
        pytest.fail("Refusing any database not created by the disposable test supervisor")
    settings = Settings(
        database_url=url,
        database_ssl_mode="disable",
        environment="test",
        app_url="http://testserver",
        mail_enabled=False,
    )
    db = Database(settings)
    with db.engine.begin() as connection:
        actual_name = connection.execute(text("SELECT current_database()")).scalar()
        assert actual_name == "vacaciones_test"
        # This schema is owned exclusively by this disposable test invocation.
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    migrate(db)
    yield db
    db.close()


@pytest.fixture
def employees(database):
    password_hash, salt, scheme = hash_password(TEST_PASSWORD)
    definitions = [
        ("admin", "admin", None),
        ("worker", "worker", "marketing"),
        ("coworker", "worker", "marketing"),
        ("manager", "manager", "marketing"),
        ("outsider", "manager", "logistica"),
        ("delegate", "worker", "logistica"),
    ]
    records = {}
    with database.sessions() as db:
        for username, role, department in definitions:
            employee = Employee(
                id="test-" + username,
                name="Prueba " + username,
                email=username + "@example.com",
                username=username,
                role=role,
                department=department,
                password_hash=password_hash,
                password_salt=salt,
                password_scheme=scheme,
                active=True,
                must_change_password=False,
            )
            db.add(employee)
            records[username] = employee
        db.commit()
    return records


@pytest.fixture
def application(database, employees):
    settings = Settings(
        database_url=os.environ["TEST_DATABASE_URL"],
        database_ssl_mode="disable",
        environment="test",
        app_url="http://testserver",
        mail_enabled=False,
    )
    app = create_app(settings)
    yield app
    app.state.database.close()


def send(client, method, path, **kwargs):
    headers = {"X-CSRF-Token": client.cookies.get(CSRF_COOKIE, ""), "Origin": "http://testserver"}
    if path == "/api/requests" and method.upper() == "POST":
        headers["Idempotency-Key"] = uuid.uuid4().hex
    headers.update(kwargs.pop("headers", {}))
    return client.request(method, path, headers=headers, **kwargs)


@pytest.fixture
def clients(application):
    clients_created = []

    def client_for(username=None):
        client = TestClient(application)
        clients_created.append(client)
        response = client.get("/")
        assert response.status_code == 200
        if username:
            response = send(
                client,
                "POST",
                "/api/auth/login",
                json={"username": username, "password": TEST_PASSWORD},
            )
            assert response.status_code == 200, response.text
        return client

    yield client_for
    for client in clients_created:
        client.close()


@pytest.fixture
def request_payload():
    return {
        "type": "vacaciones",
        "dateFrom": "2026-10-19",
        "dateTo": "2026-10-20",
        "halfStart": False,
        "halfEnd": False,
        "note": "Nota privada sintética",
    }
