"""Registration and lifecycle tests: isolated PostgreSQL, synthetic users and fake SMTP."""

import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import timedelta
from unittest.mock import Mock

import pytest
from conftest import TEST_PASSWORD, send
from sqlalchemy import func, select

from app.mailer import drain
from app.models import ActivationToken, AuditEvent, Employee, Outbox, PasswordReset, Policy, now
from app.security import digest, hash_password, verify_password

pytestmark = pytest.mark.postgres


@pytest.fixture
def invited(clients, application, database):
    settings = replace(
        application.state.settings,
        mail_enabled=True,
        smtp_user="sender@example.com",
        smtp_password="synthetic-only-smtp",
    )
    application.state.settings = settings
    admin = clients("admin")
    response = send(
        admin,
        "POST",
        "/api/users/invite",
        json={"lines": ["Synthetic Registration, register@example.com"], "role": "worker"},
    )
    assert response.status_code == 200
    row = response.json()["created"][0]
    transport = Mock()
    transport.send.return_value = "<synthetic-activation@example.com>"
    assert drain(database, settings, transport=transport)["sent"] == 1
    token = re.search(r"/activate#token=([A-Za-z0-9_-]{43})", transport.send.call_args.args[2])[1]
    return {**row, "token": token, "admin": admin, "transport": transport, "settings": settings}


def registration(row, **changes):
    return {
        "token": row["token"],
        "name": "Synthetic Registered Worker",
        "birthDate": "1992-05-14",
        "newPassword": "x" * 8,
        "confirmPassword": "x" * 8,
        **changes,
    }


def test_invitation_registration_is_required_single_use_and_keeps_token_out_of_storage(
    invited, clients, database
):
    anonymous = clients()
    html = invited["transport"].send.call_args.args[2]
    assert "Registrarme y activar mi cuenta" in html
    assert invited["token"] in invited["transport"].send.call_args.args[3]
    with database.sessions() as db:
        user = db.get(Employee, invited["userId"])
        assert user.onboarding_pending and user.active
        item = db.get(Outbox, invited["mailId"])
        assert invited["token"] not in str(item.context)
        assert db.get(ActivationToken, digest(invited["token"])) is not None
        assert db.get(ActivationToken, invited["token"]) is None
    inspected = send(anonymous, "POST", "/api/activation/inspect", json={"token": invited["token"]})
    assert inspected.status_code == 200
    assert inspected.json()["email"] == "register@example.com"
    assert "password" not in inspected.text and "birthDate" not in inspected.text
    complete = send(anonymous, "POST", "/api/activation/complete", json=registration(invited))
    assert complete.status_code == 200 and complete.json()["loginRequired"]
    assert (
        send(anonymous, "POST", "/api/activation/complete", json=registration(invited)).status_code
        == 400
    )
    assert (
        send(
            anonymous, "POST", "/api/activation/inspect", json={"token": invited["token"]}
        ).status_code
        == 400
    )
    with database.sessions() as db:
        user = db.get(Employee, invited["userId"])
        assert not user.onboarding_pending and not user.must_change_password
        assert str(user.birth_date) == "1992-05-14" and not user.share_birthday
        assert verify_password(
            "x" * 8, user.password_hash, user.password_salt, user.password_scheme
        )
    assert (
        send(
            anonymous,
            "POST",
            "/api/auth/login",
            json={"username": invited["username"], "password": "x" * 8},
        ).status_code
        == 200
    )
    assert anonymous.get("/api/bootstrap").status_code == 200
    # A registered birthday cannot subsequently be erased through profile editing.
    assert (
        send(
            anonymous, "PATCH", "/api/users/" + invited["userId"], json={"birthDate": None}
        ).status_code
        == 400
    )
    assert not clients("coworker").get("/api/bootstrap").json()["birthdays"]


@pytest.mark.parametrize(
    "changes",
    [
        {"name": " "},
        {"birthDate": ""},
        {"birthDate": None},
        {"birthDate": "2099-01-01"},
        {"birthDate": "2026-02-30"},
        {"newPassword": "x" * 7, "confirmPassword": "x" * 7},
        {"confirmPassword": "y" * 8},
        {"role": "admin"},
        {"email": "other@example.com"},
    ],
)
def test_registration_rejects_missing_invalid_fields_and_privilege_changes(
    invited, clients, database, changes
):
    response = send(
        clients(), "POST", "/api/activation/complete", json=registration(invited, **changes)
    )
    assert response.status_code == 422
    with database.sessions() as db:
        assert db.get(Employee, invited["userId"]).onboarding_pending
        assert not db.get(ActivationToken, digest(invited["token"])).used


def test_registration_expiry_csrf_and_no_password_reset_bypass(invited, clients, database):
    anonymous = clients()
    assert anonymous.post("/api/activation/complete", json=registration(invited)).status_code == 403
    assert (
        send(
            anonymous,
            "POST",
            "/api/activation/complete",
            json=registration(invited),
            headers={"Origin": "https://other.example"},
        ).status_code
        == 403
    )
    with database.sessions() as db:
        user = db.get(Employee, invited["userId"])
        user.password_hash, user.password_salt, user.password_scheme = hash_password(TEST_PASSWORD)
        db.add(
            PasswordReset(
                token_hash=digest("r" * 43), user_id=user.id, expires_at=now() + timedelta(hours=1)
            )
        )
        db.commit()
    assert (
        send(
            anonymous,
            "POST",
            "/api/auth/login",
            json={"username": invited["username"], "password": TEST_PASSWORD},
        ).status_code
        == 401
    )
    assert (
        send(
            anonymous,
            "POST",
            "/api/auth/reset-password",
            json={"token": "r" * 43, "newPassword": "z" * 8},
        ).status_code
        == 400
    )
    assert (
        send(
            invited["admin"],
            "POST",
            f"/api/users/{invited['userId']}/reset-password",
            json={"newPassword": "z" * 8},
        ).status_code
        == 409
    )
    with database.sessions() as db:
        db.get(ActivationToken, digest(invited["token"])).expires_at = now() - timedelta(seconds=1)
        db.commit()
    assert (
        send(anonymous, "POST", "/api/activation/complete", json=registration(invited)).status_code
        == 400
    )


def test_resend_invalidates_previous_link_and_is_idempotent(invited, clients, database):
    admin = invited["admin"]
    path = f"/api/users/{invited['userId']}/activation-link"
    headers = {"Idempotency-Key": "synthetic-resend-0001"}
    first = send(admin, "POST", path, headers=headers)
    assert first.status_code == 200 and first.json()["mailQueued"]
    repeated = send(admin, "POST", path, headers=headers)
    assert repeated.json()["duplicate"] and repeated.json()["mailId"] == first.json()["mailId"]
    assert (
        send(
            clients(), "POST", "/api/activation/inspect", json={"token": invited["token"]}
        ).status_code
        == 400
    )
    transport = invited["transport"]
    assert drain(database, invited["settings"], transport=transport)["sent"] == 1
    new_token = re.search(r"/activate#token=([A-Za-z0-9_-]{43})", transport.send.call_args.args[2])[
        1
    ]
    assert new_token != invited["token"]
    assert (
        send(
            clients(),
            "POST",
            "/api/activation/complete",
            json=registration({**invited, "token": new_token}, shareBirthday=True),
        ).status_code
        == 200
    )
    with database.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Employee)) == 7
        assert db.scalar(select(func.count()).select_from(Outbox)) == 2
        assert db.get(Employee, invited["userId"]).share_birthday
    status = send(admin, "POST", "/api/users/invite", json={"lines": ["register@example.com"]})
    assert status.json()["existing"][0]["mailId"] == first.json()["mailId"]


def test_suspension_reactivation_does_not_revive_activation_tokens(invited, clients, database):
    admin, path = invited["admin"], "/api/users/" + invited["userId"]
    assert send(admin, "PATCH", path, json={"active": False}).status_code == 200
    assert (
        send(clients(), "POST", "/api/activation/complete", json=registration(invited)).status_code
        == 400
    )
    assert send(admin, "PATCH", path, json={"active": True}).status_code == 200
    assert (
        send(clients(), "POST", "/api/activation/complete", json=registration(invited)).status_code
        == 400
    )
    with database.sessions() as db:
        assert db.get(Employee, invited["userId"]).onboarding_pending


def test_email_change_invalidates_existing_link(invited, clients):
    assert (
        send(
            invited["admin"],
            "PATCH",
            "/api/users/" + invited["userId"],
            json={"email": "changed@example.com"},
        ).status_code
        == 200
    )
    assert (
        send(clients(), "POST", "/api/activation/complete", json=registration(invited)).status_code
        == 400
    )


def test_concurrent_registration_completes_once(invited, clients, database):
    visitors = [clients(), clients()]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda client: send(
                    client, "POST", "/api/activation/complete", json=registration(invited)
                ),
                visitors,
            )
        )
    assert sorted(response.status_code for response in results) == [200, 400]
    with database.sessions() as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(
                    AuditEvent.action == "employee.registered",
                    AuditEvent.entity_id == invited["userId"],
                )
            )
            == 1
        )


def test_deactivation_revokes_sessions_and_reactivation_preserves_password(clients):
    admin, worker = clients("admin"), clients("worker")
    path = "/api/users/test-worker"
    assert send(admin, "PATCH", path, json={"active": False}).status_code == 200
    assert worker.get("/api/auth/me").json()["user"] is None
    assert (
        send(
            worker,
            "POST",
            "/api/auth/login",
            json={"username": "worker", "password": TEST_PASSWORD},
        ).status_code
        == 401
    )
    assert send(admin, "PATCH", path, json={"active": True}).status_code == 200
    assert (
        send(
            worker,
            "POST",
            "/api/auth/login",
            json={"username": "worker", "password": TEST_PASSWORD},
        ).status_code
        == 200
    )


def test_delete_requires_admin_confirmation_preserves_audit_and_never_removes_history(
    clients, database, request_payload
):
    admin, worker = clients("admin"), clients("worker")
    assert (
        send(
            worker, "POST", "/api/users/test-coworker/remove", json={"confirmation": "coworker"}
        ).status_code
        == 403
    )
    assert (
        send(
            admin, "POST", "/api/users/test-admin/remove", json={"confirmation": "admin"}
        ).status_code
        == 409
    )
    assert send(admin, "PATCH", "/api/users/test-admin", json={"active": False}).status_code == 409
    assert (
        send(
            admin, "POST", "/api/users/test-coworker/remove", json={"confirmation": "wrong"}
        ).status_code
        == 400
    )
    assert (
        send(
            admin, "POST", "/api/users/test-coworker/remove", json={"confirmation": "coworker"}
        ).status_code
        == 200
    )
    with database.sessions() as db:
        deleted = db.get(Employee, "test-coworker")
        assert deleted is not None and deleted.deleted_at is not None and not deleted.active
        assert deleted.email is None and deleted.username == "deleted-test-coworker"
        assert (
            db.scalar(select(AuditEvent).where(AuditEvent.action == "employee.deleted")) is not None
        )
    request = send(worker, "POST", "/api/requests", json=request_payload)
    assert request.status_code == 200
    removed = send(admin, "POST", "/api/users/test-worker/remove", json={"confirmation": "worker"})
    assert removed.status_code == 200
    assert removed.json()["historyPreserved"] and removed.json()["removedFromEmployees"]
    assert worker.get("/api/auth/me").json()["user"] is None
    assert admin.get("/api/requests/" + request.json()["id"]).status_code == 200
    assert "test-worker" not in {row["id"] for row in admin.get("/api/bootstrap").json()["users"]}
    with database.sessions() as db:
        db.add(Policy(user_id="test-delegate", year=2026, entitlement=22))
        db.commit()
    assert (
        send(
            admin, "POST", "/api/users/test-delegate/remove", json={"confirmation": "delegate"}
        ).status_code
        == 200
    )
    with database.sessions() as db:
        deleted = db.get(Employee, "test-delegate")
        assert deleted.deleted_at is not None
        assert db.get(Policy, ("test-delegate", 2026)) is not None


def test_delete_pending_invitee_removes_tokens_and_cancels_queued_mail(invited, clients, database):
    path = "/api/users/" + invited["userId"]
    assert (
        send(
            invited["admin"],
            "POST",
            path + "/activation-link",
            headers={"Idempotency-Key": "delete-pending-0001"},
        ).status_code
        == 200
    )
    assert (
        send(
            invited["admin"], "POST", path + "/remove", json={"confirmation": invited["username"]}
        ).status_code
        == 200
    )
    assert drain(database, invited["settings"], transport=invited["transport"])["sent"] == 0
    invited["transport"].send.assert_called_once()
    assert (
        send(clients(), "POST", "/api/activation/complete", json=registration(invited)).status_code
        == 400
    )
    with database.sessions() as db:
        deleted = db.get(Employee, invited["userId"])
        assert deleted is not None and deleted.deleted_at is not None
        assert not deleted.active and deleted.email is None
        assert db.scalar(select(func.count()).select_from(ActivationToken)) == 0


def test_unregistered_admin_is_not_last_admin_replacement(invited, clients, database):
    with database.sessions() as db:
        db.get(Employee, invited["userId"]).role = "admin"
        db.commit()
    assert (
        send(
            invited["admin"], "PATCH", "/api/users/test-admin", json={"role": "worker"}
        ).status_code
        == 409
    )
