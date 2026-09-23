"""Synthetic CONNECT/TLS tests: no external sockets, credentials or mail."""

import ssl
from unittest.mock import Mock

import pytest

from app import smtp_client
from app.config import Settings
from app.mail_operations import check_smtp
from app.smtp_transport import DeliveryError, SMTPTransport, open_smtp


class SocketDouble:
    def __init__(self, response):
        self.response = response
        self.sent = b""
        self.closed = False

    def sendall(self, data):
        self.sent += data

    def recv(self, count):
        result, self.response = self.response[:count], self.response[count:]
        return result

    def close(self):
        self.closed = True


def test_connect_reads_only_header_and_keeps_smtp_greeting(monkeypatch):
    connection = SocketDouble(b"HTTP/1.1 200 Connection established\r\n\r\n220 ready\r\n")
    factory = Mock(return_value=connection)
    monkeypatch.setattr(smtp_client.socket, "create_connection", factory)
    assert smtp_client.tunnel("smtp.gmail.com", 587, 10, "http://egress:3128") is connection
    factory.assert_called_once_with(("egress", 3128), 10)
    assert connection.sent == (
        b"CONNECT smtp.gmail.com:587 HTTP/1.1\r\nHost: smtp.gmail.com:587\r\n\r\n"
    )
    assert connection.response == b"220 ready\r\n" and not connection.closed


@pytest.mark.parametrize(
    "response",
    [b"", b"HTTP/1.1 403 Forbidden\r\n\r\n", b"HTTP/2 200 OK\r\n\r\n", b"X" * 8200],
)
def test_refused_truncated_or_oversized_proxy_response_closes_socket(monkeypatch, response):
    connection = SocketDouble(response)
    monkeypatch.setattr(smtp_client.socket, "create_connection", Mock(return_value=connection))
    with pytest.raises(OSError):
        smtp_client.tunnel("smtp.gmail.com", 587, 10, "http://egress:3128")
    assert connection.closed


@pytest.mark.parametrize(
    "proxy",
    [
        "",
        "https://egress:3128",
        "http://egress",
        "http://u:p@egress:3128",
        "http://egress:3128/path",
        "http://egress:3128?x=1",
        "http://egress:3128#x",
    ],
)
def test_invalid_proxy_never_opens_socket(monkeypatch, proxy):
    factory = Mock()
    monkeypatch.setattr(smtp_client.socket, "create_connection", factory)
    with pytest.raises(ValueError):
        smtp_client.tunnel("smtp.gmail.com", 587, 10, proxy)
    factory.assert_not_called()


@pytest.mark.parametrize("host,port", [("smtp.gmail.com\r\nHost: x", 587), ("smtp.gmail.com", 25)])
def test_connect_destination_rejects_injection_and_unsupported_port(monkeypatch, host, port):
    factory = Mock()
    monkeypatch.setattr(smtp_client.socket, "create_connection", factory)
    with pytest.raises(ValueError):
        smtp_client.tunnel(host, port, 10, "http://egress:3128")
    factory.assert_not_called()


@pytest.mark.parametrize("security,port", [("starttls", 587), ("ssl", 465)])
def test_proxy_connection_verifies_tls_and_does_not_authenticate(monkeypatch, security, port):
    monkeypatch.setenv("SMTP_PROXY_URL", "http://egress:3128")
    connection = Mock()
    factory, direct = Mock(return_value=connection), Mock()
    monkeypatch.setattr(smtp_client, "ProxySMTP", factory)
    monkeypatch.setattr(smtp_client, "ProxySMTPSSL", factory)
    monkeypatch.setattr(smtp_client.smtplib, "SMTP", direct)
    monkeypatch.setattr(smtp_client.smtplib, "SMTP_SSL", direct)
    assert smtp_client.connect_smtp("smtp.gmail.com", port, security) is connection
    options = factory.call_args.kwargs
    assert options["proxy_url"] == "http://egress:3128"
    assert options["host"] == "smtp.gmail.com" and options["port"] == port
    context = (
        options["context"] if security == "ssl" else connection.starttls.call_args.kwargs["context"]
    )
    assert context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED
    assert context.minimum_version >= ssl.TLSVersion.TLSv1_2
    assert connection.starttls.call_count == (1 if security == "starttls" else 0)
    connection.ehlo_or_helo_if_needed.assert_called()
    connection.login.assert_not_called()
    connection.send_message.assert_not_called()
    direct.assert_not_called()


@pytest.mark.parametrize("proxy", ["http://egress:3128", ""])
def test_proxy_failure_never_falls_back_direct(monkeypatch, proxy):
    monkeypatch.setenv("SMTP_PROXY_URL", proxy)
    factory, direct = Mock(side_effect=OSError("SMTP tunnel refused")), Mock()
    monkeypatch.setattr(smtp_client, "ProxySMTP", factory)
    monkeypatch.setattr(smtp_client.smtplib, "SMTP", direct)
    with pytest.raises(OSError):
        smtp_client.connect_smtp("smtp.gmail.com", 587, "starttls")
    direct.assert_not_called()


def test_implicit_tls_uses_original_smtp_hostname_and_closes_on_failure(monkeypatch):
    raw, wrapped, context = Mock(), Mock(), Mock()
    factory = Mock(return_value=raw)
    monkeypatch.setattr(smtp_client, "tunnel", factory)
    client = smtp_client.ProxySMTPSSL.__new__(smtp_client.ProxySMTPSSL)
    client.proxy_url, client.context = "http://egress:3128", context
    context.wrap_socket.return_value = wrapped
    assert client._get_socket("smtp.gmail.com", 465, 10) is wrapped
    context.wrap_socket.assert_called_once_with(raw, server_hostname="smtp.gmail.com")
    context.wrap_socket.side_effect = ssl.SSLCertVerificationError("synthetic certificate")
    with pytest.raises(ssl.SSLCertVerificationError):
        client._get_socket("smtp.gmail.com", 465, 10)
    raw.close.assert_called_once()


def test_starttls_failure_closes_without_login_or_send(monkeypatch):
    monkeypatch.setenv("SMTP_PROXY_URL", "http://egress:3128")
    connection = Mock()
    connection.starttls.side_effect = ssl.SSLCertVerificationError("synthetic certificate")
    monkeypatch.setattr(smtp_client, "ProxySMTP", Mock(return_value=connection))
    with pytest.raises(ssl.SSLCertVerificationError):
        smtp_client.connect_smtp("smtp.gmail.com", 587, "starttls")
    connection.close.assert_called_once()
    connection.login.assert_not_called()
    connection.send_message.assert_not_called()


def test_production_fails_closed_when_proxy_is_missing(monkeypatch):
    monkeypatch.delenv("SMTP_PROXY_URL", raising=False)
    factory = Mock()
    monkeypatch.setattr("app.smtp_transport.connect_smtp", factory)
    settings = Settings(environment="production", app_url="https://example.com", mail_enabled=False)
    with pytest.raises(ValueError, match="proxy required"):
        open_smtp(settings)
    factory.assert_not_called()


def test_connectivity_check_uses_quit_without_auth_or_message(monkeypatch):
    connection = Mock()
    connection.quit.return_value = (221, b"closing")
    monkeypatch.setenv("SMTP_PROXY_URL", "http://egress:3128")
    monkeypatch.setattr("app.mail_operations.open_smtp", Mock(return_value=connection))
    settings = Settings(environment="test", app_url="http://testserver", mail_enabled=False)
    result = check_smtp(settings)
    assert result["status"] == "smtp_tls_ready" and result["proxy_used"]
    assert not result["authenticated"] and not result["mail_sent"]
    connection.quit.assert_called_once()
    connection.close.assert_called_once()
    for name in ("login", "mail", "rcpt", "data", "send_message"):
        getattr(connection, name).assert_not_called()


def test_transport_invalid_proxy_has_non_sensitive_error(monkeypatch):
    monkeypatch.setattr("app.smtp_transport.open_smtp", Mock(side_effect=ValueError("private")))
    settings = Settings(
        environment="test",
        app_url="http://testserver",
        mail_enabled=True,
        smtp_user="sender@example.com",
        smtp_password="synthetic-only",
    )
    with pytest.raises(DeliveryError) as caught:
        SMTPTransport(settings).send("to@example.com", "test", "test", "test", "key")
    assert caught.value.code == "SMTP_CONFIGURATION_INVALID"
    assert "private" not in str(caught.value)
