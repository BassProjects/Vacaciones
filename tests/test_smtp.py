"""SMTP tests use only doubles and synthetic credentials, never real network access."""

import smtplib
import ssl
from unittest.mock import Mock

import pytest

from app.config import Settings
from app.mailer import TEMPLATES, drain
from app.smtp_transport import DeliveryError, SMTPTransport


def configuration(**overrides):
    return Settings(
        **{
            "database_url": "",
            "environment": "test",
            "app_url": "http://testserver",
            "mail_enabled": True,
            "smtp_user": "sender@example.com",
            "smtp_password": "synthetic-smtp-password-only",
            **overrides,
        }
    )


def install_fake(monkeypatch):
    connection = Mock()
    connection.send_message.return_value = {}
    factory = Mock(return_value=connection)
    monkeypatch.delenv("SMTP_PROXY_URL", raising=False)
    monkeypatch.setattr("app.smtp_client.smtplib.SMTP_SSL", factory)
    monkeypatch.setattr("app.smtp_client.smtplib.SMTP", factory)
    return connection, factory


def send(transport):
    return transport.send(
        "worker@example.com", "Aviso de prueba", "<p>Aviso</p>", "Aviso", "test-1"
    )


def test_ssl_checks_certificates_and_sends_authenticated_mime(monkeypatch):
    connection, factory = install_fake(monkeypatch)
    transport = SMTPTransport(configuration())
    html = TEMPLATES.get_template("notification.html").render(
        name="<script>",
        worker_name="Prueba",
        event="created",
        date_from="2026-10-19",
        date_to="2026-10-20",
        app_url="http://testserver",
    )
    result = transport.send("worker@example.com", "Aviso", html, "Aviso", "test-1")
    assert result == "<test-1@example.com>"
    options = factory.call_args.kwargs
    assert options["host"] == "smtp.gmail.com" and options["port"] == 465
    assert options["timeout"] == 10
    assert options["context"].verify_mode == ssl.CERT_REQUIRED
    assert options["context"].check_hostname
    connection.login.assert_called_once_with("sender@example.com", "synthetic-smtp-password-only")
    message = connection.send_message.call_args.args[0]
    assert message["From"] == "sender@example.com" and message["To"] == "worker@example.com"
    body = message.get_body(preferencelist=("html",)).get_content()
    assert "&lt;script&gt;" in body and "<script>" not in body
    assert "synthetic-smtp-password-only" not in message.as_string()
    connection.close.assert_called_once()
    connection.set_debuglevel.assert_not_called()


def test_starttls_is_mandatory_before_password_authentication(monkeypatch):
    connection, factory = install_fake(monkeypatch)
    send(SMTPTransport(configuration(smtp_security="starttls", smtp_port=587)))
    calls = [call[0] for call in connection.method_calls]
    assert calls.index("starttls") < calls.index("login") < calls.index("send_message")
    assert factory.call_args.kwargs["port"] == 587
    assert connection.starttls.call_args.kwargs["context"].check_hostname


def test_missing_starttls_never_sends_password(monkeypatch):
    connection, _ = install_fake(monkeypatch)
    connection.starttls.side_effect = smtplib.SMTPNotSupportedError("synthetic diagnostic")
    with pytest.raises(DeliveryError) as caught:
        send(SMTPTransport(configuration(smtp_security="starttls", smtp_port=587)))
    assert caught.value.state == "failed"
    connection.login.assert_not_called()
    connection.send_message.assert_not_called()
    connection.close.assert_called_once()


@pytest.mark.parametrize(
    "failure,state",
    [
        (smtplib.SMTPAuthenticationError(535, b"synthetic confidential reply"), "failed"),
        (smtplib.SMTPAuthenticationError(454, b"synthetic confidential reply"), "pending"),
        (smtplib.SMTPServerDisconnected("synthetic confidential reply"), "pending"),
        (ssl.SSLCertVerificationError("synthetic confidential reply"), "failed"),
    ],
)
def test_authentication_failures_do_not_leak_replies(monkeypatch, failure, state):
    connection, _ = install_fake(monkeypatch)
    connection.login.side_effect = failure
    with pytest.raises(DeliveryError) as caught:
        send(SMTPTransport(configuration()))
    assert caught.value.state == state
    assert "confidential" not in str(caught.value)
    connection.send_message.assert_not_called()
    connection.close.assert_called_once()


@pytest.mark.parametrize(
    "failure,state",
    [
        (smtplib.SMTPDataError(451, b"temporary"), "pending"),
        (smtplib.SMTPDataError(554, b"rejected"), "failed"),
        (smtplib.SMTPRecipientsRefused({"worker@example.com": (450, b"temporary")}), "pending"),
        (smtplib.SMTPRecipientsRefused({"worker@example.com": (550, b"rejected")}), "failed"),
        (TimeoutError("synthetic timeout after DATA"), "uncertain"),
        (ssl.SSLError("synthetic TLS disconnect after DATA"), "uncertain"),
        (smtplib.SMTPServerDisconnected("synthetic disconnect after DATA"), "uncertain"),
    ],
)
def test_delivery_outcomes_separate_safe_retries_from_uncertain_delivery(
    monkeypatch, failure, state
):
    connection, _ = install_fake(monkeypatch)
    connection.send_message.side_effect = failure
    with pytest.raises(DeliveryError) as caught:
        send(SMTPTransport(configuration()))
    assert caught.value.state == state
    connection.close.assert_called_once()


def test_cleanup_failure_does_not_repeat_an_accepted_message(monkeypatch):
    connection, _ = install_fake(monkeypatch)
    connection.close.side_effect = smtplib.SMTPServerDisconnected("synthetic close failure")
    assert send(SMTPTransport(configuration())) == "<test-1@example.com>"
    connection.send_message.assert_called_once()


@pytest.mark.parametrize(
    "options",
    [
        {"smtp_security": "none"},
        {"smtp_port": 25},
        {"smtp_port": 587},
        {"smtp_security": "starttls", "smtp_port": 465},
        {"smtp_host": "https://smtp.example.com"},
        {"mail_from": "sender@example.com\r\nBcc: other@example.com"},
    ],
)
def test_configuration_rejects_plaintext_and_invalid_parameters(options):
    with pytest.raises(ValueError):
        configuration(**options)


def test_same_smtp_credentials_can_be_supplied_via_legacy_variable_names(monkeypatch):
    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    monkeypatch.setenv("GMAIL_USER", "sender@example.com")
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "synthetic-legacy-app-password")
    settings = Settings(environment="test", app_url="http://testserver", mail_enabled=True)
    assert settings.mail_configured
    assert settings.smtp_password == "synthetic-legacy-app-password"
    assert "synthetic-legacy-app-password" not in repr(settings)


def test_disabled_mail_never_opens_a_smtp_connection(monkeypatch):
    _, factory = install_fake(monkeypatch)
    result = drain(None, configuration(mail_enabled=False))
    assert result["disabled"]
    factory.assert_not_called()
