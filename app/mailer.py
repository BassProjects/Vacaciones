"""Gmail API transport and bounded outbox delivery. No SMTP or background worker."""

import base64
import json
import secrets
import time
from datetime import timedelta
from email.message import EmailMessage
from pathlib import Path

import httpx
from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from app.models import Outbox, PasswordReset, now
from app.security import digest

TEMPLATES = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates" / "email"),
    autoescape=select_autoescape(["html", "xml"]),
)


class DeliveryError(Exception):
    def __init__(self, state, code, retry_after=60):
        self.state, self.code, self.retry_after = state, code, retry_after
        super().__init__(code)


class GmailTransport:
    def __init__(self, settings, client=None):
        self.settings = settings
        self.client = client or httpx.Client(
            timeout=httpx.Timeout(10, connect=5), trust_env=True, follow_redirects=False
        )
        self.owned_client = client is None
        self.access_token = None
        self.expires = 0

    def close(self):
        if self.owned_client:
            self.client.close()

    def _json_request(self, method, url, **kwargs):
        with self.client.stream(method, url, **kwargs) as response:
            content = bytearray()
            for part in response.iter_bytes():
                content.extend(part)
                if len(content) > 256 * 1024:
                    raise ValueError("GMAIL_RESPONSE_TOO_LARGE")
            try:
                body = json.loads(content)
            except (ValueError, UnicodeDecodeError):
                body = {}
            return response.status_code, body

    def _token(self):
        if self.access_token and time.monotonic() < self.expires:
            return self.access_token
        try:
            status, body = self._json_request(
                "POST",
                "https://oauth2.googleapis.com/token",
                data={
                    "grant_type": "refresh_token",
                    "client_id": self.settings.google_client_id,
                    "client_secret": self.settings.google_client_secret,
                    "refresh_token": self.settings.gmail_refresh_token,
                },
            )
        except (httpx.HTTPError, ValueError) as exc:
            raise DeliveryError("pending", "GMAIL_TOKEN_UNAVAILABLE") from exc
        if status == 429 or status >= 500:
            raise DeliveryError("pending", "GMAIL_TOKEN_UNAVAILABLE")
        if status != 200 or not isinstance(body.get("access_token"), str):
            raise DeliveryError("failed", "GMAIL_AUTH_REJECTED")
        self.access_token = body["access_token"]
        self.expires = time.monotonic() + max(1, min(int(body.get("expires_in", 300)), 3600) - 30)
        return self.access_token

    def send(self, recipient, subject, html, text_body, message_key):
        token = self._token()
        message = EmailMessage()
        message["To"], message["From"], message["Subject"] = (
            recipient,
            self.settings.gmail_from,
            subject,
        )
        # Stable Message-ID helps investigation; Gmail does NOT promise deduplication by it.
        message["Message-ID"] = f"<{message_key}@vacaciones.electropolis.invalid>"
        message.set_content(text_body)
        message.add_alternative(html, subtype="html")
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        try:
            status, body = self._json_request(
                "POST",
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                headers={"Authorization": f"Bearer {token}"},
                json={"raw": raw},
            )
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout) as exc:
            raise DeliveryError("pending", "GMAIL_CONNECTION_FAILED") from exc
        except (httpx.HTTPError, ValueError) as exc:
            # The provider may have accepted it. Never automatically retry uncertain delivery.
            raise DeliveryError("uncertain", "GMAIL_DELIVERY_UNCERTAIN") from exc
        if status == 429:
            raise DeliveryError("pending", "GMAIL_RATE_LIMIT")
        if status == 401:
            self.access_token = None
            raise DeliveryError("pending", "GMAIL_ACCESS_EXPIRED")
        if status == 403:
            reasons = {e.get("reason") for e in body.get("error", {}).get("errors", [])}
            if reasons & {"rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded"}:
                raise DeliveryError("pending", "GMAIL_QUOTA_LIMIT", retry_after=300)
            raise DeliveryError("failed", "GMAIL_PERMISSION_DENIED")
        if status >= 500 or 200 <= status < 300 and not body.get("id"):
            raise DeliveryError("uncertain", "GMAIL_DELIVERY_UNCERTAIN")
        if not 200 <= status < 300:
            raise DeliveryError("failed", "GMAIL_MESSAGE_REJECTED")
        return str(body["id"])


def queue_mail(db, event_key, recipient, subject, context, template="notification.html"):
    if recipient:
        db.add(
            Outbox(
                event_key=event_key,
                recipient=recipient,
                subject=subject,
                context=context,
                template=template,
            )
        )


def queue_password_link(db, user, event_key, invitation=False):
    # Self-service recovery UI could not be delivered by the available tool.
    # Do not generate unusable expiring links; onboarding uses an administrator-controlled reset.
    if not invitation:
        return False
    queue_mail(
        db,
        event_key,
        user.email,
        "Tu cuenta de vacaciones está preparada",
        {"name": user.name},
        "welcome.html",
    )
    return True


def drain(database, settings, limit=10, seconds=45, transport=None):
    counts = {"sent": 0, "pending": 0, "failed": 0, "uncertain": 0}
    if not settings.mail_enabled:
        return {**counts, "disabled": True}
    started = time.monotonic()
    transport = transport or GmailTransport(settings)
    with database.engine.connect() as connection:
        locked = connection.execute(text("SELECT pg_try_advisory_lock(768429115)")).scalar()
        connection.commit()
        if not locked:
            transport.close()
            return {**counts, "busy": True}
        try:
            with Session(bind=connection, expire_on_commit=False) as db:
                db.execute(
                    update(Outbox)
                    .where(
                        Outbox.status == "sending",
                        Outbox.available_at < now() - timedelta(minutes=15),
                    )
                    .values(status="uncertain", last_error="WORKER_INTERRUPTED")
                )
                db.commit()
                for _ in range(min(limit, 25)):
                    if time.monotonic() - started >= seconds:
                        break
                    item = db.scalar(
                        select(Outbox)
                        .where(Outbox.status == "pending", Outbox.available_at <= now())
                        .order_by(Outbox.created_at)
                        .limit(1)
                        .with_for_update()
                    )
                    if not item:
                        break
                    context = {**item.context, "app_url": settings.app_url}
                    if item.template == "password.html":
                        raw_token = secrets.token_urlsafe(32)
                        db.execute(
                            update(PasswordReset)
                            .where(PasswordReset.user_id == context["user_id"])
                            .values(used=True)
                        )
                        db.add(
                            PasswordReset(
                                token_hash=digest(raw_token),
                                user_id=context["user_id"],
                                expires_at=now() + timedelta(hours=1),
                            )
                        )
                        context["reset_url"] = settings.app_url + "/#reset=" + raw_token
                    item.status = "sending"
                    item.attempts += 1
                    item.available_at = now()
                    db.commit()
                    try:
                        html = TEMPLATES.get_template(item.template).render(**context)
                        text_body = (
                            "Accede a "
                            + context.get("reset_url", settings.app_url)
                            + " para consultar esta notificación de vacaciones."
                        )
                        item.gmail_message_id = transport.send(
                            item.recipient, item.subject, html, text_body, item.id
                        )
                        item.status = "sent"
                        item.last_error = None
                    except DeliveryError as exc:
                        item.status = (
                            "failed" if item.attempts >= 8 and exc.state == "pending" else exc.state
                        )
                        item.last_error = exc.code
                        item.available_at = now() + timedelta(
                            seconds=min(3600, max(exc.retry_after, 30 * 2 ** min(item.attempts, 7)))
                        )
                    except Exception:
                        item.status = "uncertain"
                        item.last_error = "DELIVERY_INTERNAL_ERROR"
                    counts[item.status] = counts.get(item.status, 0) + 1
                    db.commit()
        finally:
            connection.execute(text("SELECT pg_advisory_unlock(768429115)"))
            connection.commit()
            transport.close()
    return counts
