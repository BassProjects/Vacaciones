"""Eight-character policy checks using synthetic data only; never production accounts."""

import hashlib
from datetime import timedelta

import pytest
from conftest import TEST_PASSWORD, send
from pydantic import ValidationError
from sqlalchemy import select

from app.models import Employee, PasswordReset, now
from app.schemas import ChangePassword, CompleteReset, EmployeeCreate, ResetPassword
from app.security import digest, hash_password, verify_password


@pytest.mark.parametrize("length", [8, 9, 11, 12, 16, 256])
def test_password_hash_accepts_eight_through_256_characters(length):
    password = "x" * length
    encoded = hash_password(password)
    assert verify_password(password, *encoded)
    assert not verify_password("y" * length, *encoded)


@pytest.mark.parametrize("length", [0, 1, 7, 257])
def test_password_hash_rejects_values_outside_policy(length):
    with pytest.raises(ValueError, match="entre 8 y 256"):
        hash_password("x" * length)


@pytest.mark.parametrize(
    "model,field,extra",
    [
        (
            EmployeeCreate,
            "password",
            {"name": "Synthetic user", "email": "policy@example.com", "username": "policy"},
        ),
        (ChangePassword, "newPassword", {"currentPassword": TEST_PASSWORD}),
        (ResetPassword, "newPassword", {}),
        (CompleteReset, "newPassword", {"token": "r" * 43}),
    ],
)
@pytest.mark.parametrize("length", [7, 8, 11, 256, 257])
def test_all_new_password_schemas_share_the_same_limits(model, field, extra, length):
    payload = {**extra, field: "x" * length}
    if 8 <= length <= 256:
        model.model_validate(payload)
    else:
        with pytest.raises(ValidationError):
            model.model_validate(payload)


@pytest.mark.postgres
def test_creation_change_and_admin_reset_accept_eight_and_reject_seven(clients, database):
    admin, worker, other_session = clients("admin"), clients("worker"), clients("worker")
    new_user = {"name": "Synthetic policy", "email": "policy@example.com", "username": "policy"}
    rejected = send(admin, "POST", "/api/users", json={**new_user, "password": "a" * 7})
    assert rejected.status_code == 422
    with database.sessions() as db:
        assert db.scalar(select(Employee).where(Employee.username == "policy")) is None
    created = send(admin, "POST", "/api/users", json={**new_user, "password": "a" * 8})
    assert created.status_code == 200, created.text
    with database.sessions() as db:
        user = db.scalar(select(Employee).where(Employee.username == "policy"))
        assert verify_password(
            "a" * 8, user.password_hash, user.password_salt, user.password_scheme
        )

    rejected = send(
        worker,
        "POST",
        "/api/auth/change-password",
        json={"currentPassword": TEST_PASSWORD, "newPassword": "b" * 7},
    )
    assert rejected.status_code == 422
    assert other_session.get("/api/auth/me").json()["user"] is not None
    changed = send(
        worker,
        "POST",
        "/api/auth/change-password",
        json={"currentPassword": TEST_PASSWORD, "newPassword": "b" * 8},
    )
    assert changed.status_code == 200, changed.text
    assert other_session.get("/api/auth/me").json()["user"] is None
    logged_in = clients()
    assert (
        send(
            logged_in,
            "POST",
            "/api/auth/login",
            json={"username": "worker", "password": TEST_PASSWORD},
        ).status_code
        == 401
    )
    assert (
        send(
            logged_in,
            "POST",
            "/api/auth/login",
            json={"username": "worker", "password": "b" * 8},
        ).status_code
        == 200
    )
    reset_path = "/api/users/test-worker/reset-password"
    assert send(admin, "POST", reset_path, json={"newPassword": "c" * 7}).status_code == 422
    assert logged_in.get("/api/auth/me").json()["user"] is not None
    reset = send(admin, "POST", reset_path, json={"newPassword": "c" * 8})
    assert reset.status_code == 200, reset.text
    assert logged_in.get("/api/auth/me").json()["user"] is None
    login = send(
        logged_in,
        "POST",
        "/api/auth/login",
        json={"username": "worker", "password": "c" * 8},
    )
    assert login.status_code == 200 and login.json()["user"]["mustChangePassword"]
    assert logged_in.get("/api/bootstrap").status_code == 403


@pytest.mark.postgres
def test_reset_token_accepts_eight_preserving_expiry_and_session_revocation(clients, database):
    worker, anonymous = clients("worker"), clients()
    token = "r" * 43
    with database.sessions() as db:
        db.add(
            PasswordReset(
                token_hash=digest(token),
                user_id="test-worker",
                expires_at=now() + timedelta(hours=1),
            )
        )
        db.commit()
    assert (
        send(
            anonymous,
            "POST",
            "/api/auth/reset-password",
            json={"token": token, "newPassword": "d" * 7},
        ).status_code
        == 422
    )
    with database.sessions() as db:
        assert not db.get(PasswordReset, digest(token)).used
    result = send(
        anonymous,
        "POST",
        "/api/auth/reset-password",
        json={"token": token, "newPassword": "d" * 8},
    )
    assert result.status_code == 200, result.text
    assert worker.get("/api/auth/me").json()["user"] is None
    assert (
        send(
            anonymous,
            "POST",
            "/api/auth/reset-password",
            json={"token": token, "newPassword": "e" * 8},
        ).status_code
        == 400
    )
    assert (
        send(
            anonymous,
            "POST",
            "/api/auth/login",
            json={"username": "worker", "password": "d" * 8},
        ).status_code
        == 200
    )


@pytest.mark.postgres
@pytest.mark.parametrize("length", [7, 8, 11])
def test_legacy_password_upgrade_uses_the_new_minimum(clients, database, length):
    client = clients()
    password, salt = "z" * length, "ab" * 16
    encoded = hashlib.scrypt(
        password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64
    ).hex()
    with database.sessions() as db:
        user = db.get(Employee, "test-worker")
        user.password_hash, user.password_salt, user.password_scheme = (
            encoded,
            salt,
            "scrypt-node-v1",
        )
        user.must_change_password = False
        db.commit()
    result = send(
        client,
        "POST",
        "/api/auth/login",
        json={"username": "worker", "password": password},
    )
    assert result.status_code == 200, result.text
    assert result.json()["user"]["mustChangePassword"] is (length < 8)
    with database.sessions() as db:
        user = db.get(Employee, "test-worker")
        assert user.password_scheme == ("scrypt-v2" if length >= 8 else "scrypt-node-v1")
        assert verify_password(
            password, user.password_hash, user.password_salt, user.password_scheme
        )
