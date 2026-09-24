"""Invitation delivery and status checks use isolated PostgreSQL and fake SMTP only."""

from dataclasses import replace
from unittest.mock import Mock

import pytest
from conftest import send
from sqlalchemy import func, select

from app.mailer import drain
from app.models import Employee, Outbox

pytestmark = pytest.mark.postgres


@pytest.fixture
def mail_enabled(application):
    application.state.settings = replace(
        application.state.settings,
        mail_enabled=True,
        smtp_user="sender@example.com",
        smtp_password="synthetic-test-mail-password",
    )
    return application.state.settings


def invite(client, *lines):
    return send(
        client,
        "POST",
        "/api/users/invite",
        json={"lines": list(lines), "role": "worker"},
    )


def test_invitation_is_delivered_and_status_changes_without_resending(
    clients, database, mail_enabled
):
    admin = clients("admin")
    response = invite(admin, "Synthetic Worker, invited@example.com")
    assert response.status_code == 200
    row = response.json()["created"][0]
    assert row["mailStatus"] == "pending" and row["mailQueued"] and not row["mailSent"]
    message_id = row["mailId"]
    assert message_id
    transport = Mock()
    transport.send.return_value = "<synthetic-welcome@example.com>"
    result = drain(database, mail_enabled, transport=transport)
    assert result == {"sent": 1, "pending": 0, "failed": 0, "uncertain": 0}
    args = transport.send.call_args.args
    assert args[0] == "invited@example.com"
    assert "Synthetic Worker" in args[2] and "Registrarme y activar mi cuenta" in args[2]
    assert mail_enabled.smtp_password not in args[2]
    status = admin.get("/api/users/invitation-status", params={"ids": message_id})
    assert status.status_code == 200
    assert status.json()["messages"] == [
        {
            "mailId": message_id,
            "mailStatus": "sent",
            "mailSent": True,
            "mailQueued": False,
            "mailError": None,
        }
    ]
    # A status refresh and the next worker run cannot send the invitation twice.
    admin.get("/api/users/invitation-status", params={"ids": message_id})
    drain(database, mail_enabled, transport=transport)
    transport.send.assert_called_once()


def test_repeated_invitation_returns_existing_delivery_without_new_account_or_mail(
    clients, database, mail_enabled
):
    admin = clients("admin")
    first = invite(admin, "repeat@example.com").json()["created"][0]
    transport = Mock()
    transport.send.return_value = "<synthetic-repeat@example.com>"
    drain(database, mail_enabled, transport=transport)
    response = invite(admin, "repeat@example.com", "worker@example.com")
    assert response.status_code == 200
    data = response.json()
    assert data["created"] == [] and data["skipped"] == ["repeat@example.com", "worker@example.com"]
    assert data["existing"][0]["mailId"] == first["mailId"]
    assert data["existing"][0]["mailStatus"] == "sent"
    assert data["existing"][1]["mailStatus"] == "not_queued"
    with database.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Employee)) == 7
        assert db.scalar(select(func.count()).select_from(Outbox)) == 1
    transport.send.assert_called_once()


@pytest.mark.parametrize("state", ["pending", "sending", "sent", "failed", "uncertain"])
def test_read_only_status_is_truthful_for_every_delivery_state(
    clients, database, mail_enabled, state
):
    admin = clients("admin")
    row = invite(admin, "state@example.com").json()["created"][0]
    error = "SMTP_AUTH_REJECTED" if state == "failed" else None
    with database.sessions() as db:
        item = db.get(Outbox, row["mailId"])
        item.status, item.last_error = state, error
        db.commit()
    result = admin.get("/api/users/invitation-status", params={"ids": row["mailId"]})
    assert result.status_code == 200
    message = result.json()["messages"][0]
    assert message["mailStatus"] == state and message["mailError"] == error
    assert message["mailSent"] is (state == "sent")
    assert message["mailQueued"] is (state in {"pending", "sending"})
    assert not {"recipient", "context", "password"} & message.keys()
    with database.sessions() as db:
        item = db.get(Outbox, row["mailId"])
        assert item.status == state and item.attempts == 0


def test_status_requires_admin_and_does_not_expose_other_outbox_messages(
    clients, database, mail_enabled
):
    admin, worker, anonymous = clients("admin"), clients("worker"), clients()
    with database.sessions() as db:
        db.add(
            Outbox(
                id="not-an-invitation",
                event_key="smtp-test:synthetic",
                recipient="private@example.com",
                subject="Private",
                context={},
            )
        )
        db.commit()
    path = "/api/users/invitation-status?ids=not-an-invitation"
    assert anonymous.get(path).status_code == 401
    assert worker.get(path).status_code == 403
    assert admin.get(path).json() == {"messages": []}
    for invalid in ("bad id", "id,,other", ",".join(["id"] * 101)):
        assert admin.get("/api/users/invitation-status", params={"ids": invalid}).status_code == 400
    assert admin.get("/api/users/invitation-status").status_code == 422


def test_disabled_mail_or_non_admin_cannot_queue_invitations(clients, database):
    admin, worker = clients("admin"), clients("worker")
    assert invite(admin, "disabled@example.com").status_code == 503
    assert invite(worker, "denied@example.com").status_code == 403
    with database.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Outbox)) == 0
        assert db.scalar(select(func.count()).select_from(Employee)) == 6
