"""Verified SMTP TLS through the explicit HTTP CONNECT proxy.

Adapted from Electropolis agent_guide(topic="smtp"), standard 1.0.0.
No credentials, message handling, dependencies or global socket monkeypatch.
"""

import os
import re
import smtplib
import socket
import ssl
from urllib.parse import urlsplit


def tunnel(host, port, timeout, proxy_url):
    if not re.fullmatch(r"[A-Za-z0-9.-]+", host) or port not in (465, 587):
        raise ValueError("Invalid SMTP destination")
    proxy = urlsplit(proxy_url)
    if (
        proxy.scheme != "http"
        or not proxy.hostname
        or not proxy.port
        or proxy.username
        or proxy.password
        or proxy.path not in ("", "/")
        or proxy.query
        or proxy.fragment
    ):
        raise ValueError("Invalid SMTP proxy")
    connection = socket.create_connection((proxy.hostname, proxy.port), timeout)
    try:
        target = f"{host}:{port}"
        connection.sendall(f"CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n\r\n".encode("ascii"))
        # Never buffer past the header: the next bytes may be the SMTP greeting.
        header = bytearray()
        while not header.endswith(b"\r\n\r\n"):
            data = connection.recv(1)
            if not data or len(header) >= 8192:
                raise OSError("Invalid SMTP proxy response")
            header.extend(data)
        status = bytes(header).split(b"\r\n", 1)[0].split()
        if len(status) < 2 or status[0] not in (b"HTTP/1.0", b"HTTP/1.1") or status[1] != b"200":
            raise OSError("SMTP tunnel refused")
        return connection
    except BaseException:
        connection.close()
        raise


class ProxySMTP(smtplib.SMTP):
    def __init__(self, *args, proxy_url, **kwargs):
        self.proxy_url = proxy_url
        super().__init__(*args, **kwargs)

    def _get_socket(self, host, port, timeout):
        return tunnel(host, port, timeout, self.proxy_url)


class ProxySMTPSSL(smtplib.SMTP_SSL):
    def __init__(self, *args, proxy_url, **kwargs):
        self.proxy_url = proxy_url
        super().__init__(*args, **kwargs)

    def _get_socket(self, host, port, timeout):
        connection = tunnel(host, port, timeout, self.proxy_url)
        try:
            return self.context.wrap_socket(connection, server_hostname=host)
        except BaseException:
            connection.close()
            raise


def connect_smtp(host, port, security, *, timeout=10, local_hostname="application"):
    """Return verified TLS ready for login. Caller must close the connection.

    An absent proxy permits ordinary SMTP only in environments allowing direct
    egress. A present but invalid/refused proxy never falls back to direct access.
    Vacaciones additionally requires the injected proxy in production.
    """
    if (security, port) not in (("starttls", 587), ("ssl", 465)):
        raise ValueError("SMTP requires STARTTLS/587 or implicit TLS/465")
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    proxy = os.environ.get("SMTP_PROXY_URL")
    common = dict(host=host, port=port, timeout=timeout, local_hostname=local_hostname)
    connection = None
    try:
        if security == "ssl":
            client = ProxySMTPSSL if proxy is not None else smtplib.SMTP_SSL
            connection = client(
                **common, context=context, **({"proxy_url": proxy} if proxy is not None else {})
            )
        else:
            client = ProxySMTP if proxy is not None else smtplib.SMTP
            connection = client(**common, **({"proxy_url": proxy} if proxy is not None else {}))
            connection.ehlo_or_helo_if_needed()
            connection.starttls(context=context)
        connection.ehlo_or_helo_if_needed()
        return connection
    except BaseException:
        if connection is not None:
            connection.close()
        raise
