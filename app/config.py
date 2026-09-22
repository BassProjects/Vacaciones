"""Environment contract. Credentials never belong in templates or logs."""

import os
import re
from dataclasses import dataclass, field
from email.utils import parseaddr
from urllib.parse import urlparse

from pydantic import EmailStr, TypeAdapter


@dataclass(frozen=True)
class Settings:
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", ""), repr=False)
    database_ssl_mode: str = field(
        default_factory=lambda: os.getenv("DATABASE_SSL_MODE", "verify-full")
    )
    app_url: str = field(default_factory=lambda: os.getenv("APP_URL", "").rstrip("/"))
    environment: str = field(default_factory=lambda: os.getenv("APP_ENV", "production"))
    mail_enabled: bool = field(default_factory=lambda: os.getenv("MAIL_ENABLED", "false") == "true")
    smtp_host: str = field(default_factory=lambda: os.getenv("SMTP_HOST", "smtp.gmail.com"))
    smtp_port: int = field(default_factory=lambda: int(os.getenv("SMTP_PORT", "465")))
    smtp_security: str = field(default_factory=lambda: os.getenv("SMTP_SECURITY", "ssl"))
    smtp_user: str = field(
        default_factory=lambda: os.getenv("SMTP_USER") or os.getenv("GMAIL_USER", ""), repr=False
    )
    smtp_password: str = field(
        default_factory=lambda: os.getenv("SMTP_PASSWORD") or os.getenv("GMAIL_APP_PASSWORD", ""),
        repr=False,
    )
    mail_from: str = field(default_factory=lambda: os.getenv("MAIL_FROM", ""), repr=False)
    session_hours: int = 12
    max_upload_bytes: int = 8 * 1024 * 1024
    max_request_bytes: int = 10 * 1024 * 1024
    max_attachments_per_request: int = 10
    max_attachment_bytes_per_request: int = 32 * 1024 * 1024

    def __post_init__(self):
        if self.environment not in {"production", "test", "development"}:
            raise ValueError("APP_ENV no válido")
        if self.database_ssl_mode not in {"disable", "verify-full"}:
            raise ValueError("DATABASE_SSL_MODE debe ser disable o verify-full")
        if self.database_url and urlparse(self.database_url).scheme not in {
            "postgres",
            "postgresql",
            "postgresql+psycopg",
        }:
            raise ValueError("Se requiere PostgreSQL; no se permite sustituirlo por SQLite")
        if self.app_url:
            parsed = urlparse(self.app_url)
            if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path:
                raise ValueError("APP_URL debe ser un origen sin credenciales ni ruta")
            if not parsed.hostname or parsed.scheme not in {"http", "https"}:
                raise ValueError("APP_URL no válido")
            if self.environment == "production" and parsed.scheme != "https":
                raise ValueError("APP_URL debe usar HTTPS en producción")
        if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?", self.smtp_host):
            raise ValueError("SMTP_HOST debe ser un nombre de servidor sin URL ni credenciales")
        if (self.smtp_security, self.smtp_port) not in {("ssl", 465), ("starttls", 587)}:
            raise ValueError("SMTP requiere SSL en 465 o STARTTLS obligatorio en 587")
        if self.smtp_user:
            TypeAdapter(EmailStr).validate_python(self.smtp_user)
        if self.mail_from:
            if "\r" in self.mail_from or "\n" in self.mail_from:
                raise ValueError("MAIL_FROM no válido")
            TypeAdapter(EmailStr).validate_python(parseaddr(self.mail_from)[1])
        if self.mail_enabled and not self.mail_configured:
            raise ValueError("SMTP activado sin configuración completa")

    @property
    def secure_cookies(self):
        return self.environment == "production"

    @property
    def mail_configured(self):
        return bool(self.app_url and self.smtp_user and self.smtp_password)

    @property
    def sender(self):
        return self.mail_from or self.smtp_user
