"""Environment contract. Credentials never belong in templates or logs."""

import os
from dataclasses import dataclass, field
from urllib.parse import urlparse


@dataclass(frozen=True)
class Settings:
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", ""), repr=False)
    database_ssl_mode: str = field(
        default_factory=lambda: os.getenv("DATABASE_SSL_MODE", "verify-full")
    )
    app_url: str = field(default_factory=lambda: os.getenv("APP_URL", "").rstrip("/"))
    environment: str = field(default_factory=lambda: os.getenv("APP_ENV", "production"))
    mail_enabled: bool = field(default_factory=lambda: os.getenv("MAIL_ENABLED", "false") == "true")
    gmail_from: str = field(default_factory=lambda: os.getenv("GMAIL_FROM", ""))
    google_client_id: str = field(
        default_factory=lambda: os.getenv("GOOGLE_CLIENT_ID", ""), repr=False
    )
    google_client_secret: str = field(
        default_factory=lambda: os.getenv("GOOGLE_CLIENT_SECRET", ""), repr=False
    )
    gmail_refresh_token: str = field(
        default_factory=lambda: os.getenv("GMAIL_REFRESH_TOKEN", ""), repr=False
    )
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
        if self.mail_enabled and not self.mail_configured:
            raise ValueError("Gmail API activada sin configuración completa")

    @property
    def secure_cookies(self):
        return self.environment == "production"

    @property
    def mail_configured(self):
        return bool(
            self.app_url
            and self.gmail_from
            and self.google_client_id
            and self.google_client_secret
            and self.gmail_refresh_token
        )
