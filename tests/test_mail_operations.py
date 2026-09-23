"""Commissioning uses synthetic messages, a fake transport and isolated PostgreSQL."""

from unittest.mock import Mock

import pytest
from sqlalchemy import func, select, text

from app import cli
from app.config import Settings
from app.mail_operations import OUTBOX_LOCK, send_test_mail
from app.models import Outbox
from app.smtp_transport import DeliveryError


def settings():
    return Settings(
        environment="test",
        app_url="http://testserver",
        mail_enabled=False,
        smtp_user="sender@example.com",
        smtp_password="synthetic-only",
    )


@pytest.mark.postgres
def test_explicit_test_sends_once_without_processing_other_mail(database):
    with database.sessions() as db:
        db.add(
            Outbox(event_key="other", recipient="other@example.com", subject="other", context={})
        )
        db.commit()
    transport = Mock()
    transport.send.return_value = "<synthetic@example.com>"
    result = send_test_mail(database, settings(), "qa@example.com", "synthetic-key-01", transport)
    assert result["accepted"] and result["status"] == "sent" and not result["duplicate"]
    again = send_test_mail(database, settings(), "qa@example.com", "synthetic-key-01", transport)
    assert again["accepted"] and again["status"] == "already_sent" and again["duplicate"]
    transport.send.assert_called_once()
    assert transport.send.call_args.args[0] == "qa@example.com"
    assert "synthetic-only" not in str(transport.send.call_args)
    with database.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Outbox)) == 2
        assert db.scalar(select(Outbox).where(Outbox.event_key == "other")).status == "pending"
        item = db.get(Outbox, result["outbox_id"])
        assert item.status == "sent" and item.attempts == 1
    with pytest.raises(ValueError, match="another recipient"):
        send_test_mail(database, settings(), "other@example.com", "synthetic-key-01", transport)
    transport.send.assert_called_once()


@pytest.mark.postgres
@pytest.mark.parametrize(
    "state,expected", [("failed", "failed"), ("pending", "failed"), ("uncertain", "uncertain")]
)
def test_failed_or_uncertain_test_is_persistent_and_never_repeated(database, state, expected):
    transport = Mock()
    transport.send.side_effect = DeliveryError(state, "SMTP_TEST_FAILURE")
    result = send_test_mail(database, settings(), "qa@example.com", "synthetic-key-02", transport)
    assert not result["accepted"] and result["status"] == expected
    again = send_test_mail(database, settings(), "qa@example.com", "synthetic-key-02", transport)
    assert again["duplicate"] and not again["accepted"]
    transport.send.assert_called_once()
    with database.sessions() as db:
        assert db.get(Outbox, result["outbox_id"]).status == expected


@pytest.mark.postgres
def test_interrupted_test_is_not_sent_again(database):
    with database.sessions() as db:
        db.add(
            Outbox(
                event_key="smtp-test:synthetic-key-03",
                recipient="qa@example.com",
                subject="test",
                context={},
                status="sending",
                attempts=1,
            )
        )
        db.commit()
    transport = Mock()
    result = send_test_mail(database, settings(), "qa@example.com", "synthetic-key-03", transport)
    assert result["duplicate"] and not result["accepted"]
    transport.send.assert_not_called()


@pytest.mark.postgres
def test_test_mail_obeys_worker_exclusion(database):
    transport = Mock()
    with database.engine.connect() as connection:
        connection.execute(text(f"SELECT pg_advisory_lock({OUTBOX_LOCK})"))
        connection.commit()
        try:
            result = send_test_mail(
                database, settings(), "qa@example.com", "synthetic-key-04", transport
            )
            assert result["status"] == "busy" and not result["accepted"]
            transport.send.assert_not_called()
        finally:
            connection.execute(text(f"SELECT pg_advisory_unlock({OUTBOX_LOCK})"))
            connection.commit()


@pytest.mark.parametrize(
    "recipient,key", [("invalid", "synthetic-key"), ("qa@example.com", "bad key")]
)
def test_test_validates_destination_and_key_before_database_or_network(recipient, key):
    transport = Mock()
    with pytest.raises(ValueError):
        send_test_mail(None, settings(), recipient, key, transport)
    transport.send.assert_not_called()


def test_network_cli_does_not_open_database_or_send_mail(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["cli", "smtp-check"])
    monkeypatch.setattr(cli, "Settings", settings)
    database, send = Mock(), Mock()
    monkeypatch.setattr(cli, "Database", database)
    monkeypatch.setattr(cli, "send_test_mail", send)
    monkeypatch.setattr(
        cli, "check_smtp", Mock(return_value={"status": "smtp_tls_ready", "authenticated": False})
    )
    assert cli.main() == 0
    assert "smtp_tls_ready" in capsys.readouterr().out
    database.assert_not_called()
    send.assert_not_called()


def test_mail_test_requires_explicit_send_flag(monkeypatch):
    monkeypatch.setattr(
        "sys.argv",
        ["cli", "mail-test", "--recipient", "qa@example.com", "--message-key", "synthetic-key"],
    )
    with pytest.raises(SystemExit) as caught:
        cli.main()
    assert caught.value.code == 2


def test_rejected_test_has_nonzero_exit_code(monkeypatch, capsys):
    monkeypatch.setattr(
        "sys.argv",
        [
            "cli",
            "mail-test",
            "--recipient",
            "qa@example.com",
            "--message-key",
            "synthetic-key",
            "--send",
        ],
    )
    monkeypatch.setattr(cli, "Settings", settings)
    database = Mock()
    monkeypatch.setattr(cli, "Database", Mock(return_value=database))
    monkeypatch.setattr(
        cli,
        "send_test_mail",
        Mock(return_value={"accepted": False, "error_code": "SMTP_AUTH_REJECTED"}),
    )
    assert cli.main() == 1
    assert "SMTP_AUTH_REJECTED" in capsys.readouterr().out
    database.close.assert_called_once()


def test_mail_test_accepts_environment_parameters_without_putting_them_in_command(monkeypatch):
    monkeypatch.setenv("SMTP_TEST_RECIPIENT", "qa@example.com")
    monkeypatch.setenv("SMTP_TEST_MESSAGE_ID", "synthetic-env-01")
    monkeypatch.setattr("sys.argv", ["cli", "mail-test", "--send"])
    monkeypatch.setattr(cli, "Settings", settings)
    database = Mock()
    monkeypatch.setattr(cli, "Database", Mock(return_value=database))
    operation = Mock(return_value={"accepted": True, "status": "sent"})
    monkeypatch.setattr(cli, "send_test_mail", operation)
    assert cli.main() == 0
    assert operation.call_args.args[2:] == ("qa@example.com", "synthetic-env-01")
    database.close.assert_called_once()
