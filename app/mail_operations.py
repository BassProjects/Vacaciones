"""Explicit SMTP diagnostics and one-recipient commissioning; never background jobs."""

import os
import re
from html import escape

from pydantic import EmailStr, TypeAdapter
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db import audit
from app.models import Outbox
from app.smtp_transport import DeliveryError, SMTPTransport, open_smtp

OUTBOX_LOCK = 768429115  # Same exclusion as the existing mail-drain worker.


def check_smtp(settings):
    """CONNECT, SMTP greeting, EHLO, verified TLS, EHLO, QUIT; no AUTH or message."""
    connection = open_smtp(settings)
    try:
        code, _ = connection.quit()
        if code != 221:
            raise ValueError("SMTP check did not close normally")
        return {
            "status": "smtp_tls_ready",
            "proxy_used": bool(os.environ.get("SMTP_PROXY_URL")),
            "host": settings.smtp_host,
            "port": settings.smtp_port,
            "security": settings.smtp_security,
            "authenticated": False,
            "mail_sent": False,
        }
    finally:
        connection.close()


def send_test_mail(database, settings, recipient, message_key, transport=None):
    """Send one explicitly authorized test, even while automatic mail is paused.

    A persistent event key and the worker's advisory lock prevent duplicate sends.
    A recorded failed/uncertain/interrupted test is never automatically retried.
    No employee, invitation, password or ordinary pending message is processed.
    """
    recipient = str(TypeAdapter(EmailStr).validate_python(recipient)).lower()
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", message_key):
        raise ValueError("Invalid test message key")
    event_key = "smtp-test:" + message_key
    transport = transport or SMTPTransport(settings)
    with database.engine.connect() as connection:
        locked = connection.execute(text(f"SELECT pg_try_advisory_lock({OUTBOX_LOCK})")).scalar()
        connection.commit()
        if not locked:
            transport.close()
            return {"status": "busy", "accepted": False}
        try:
            with Session(bind=connection, expire_on_commit=False) as db:
                item = db.scalar(select(Outbox).where(Outbox.event_key == event_key))
                if item:
                    if item.recipient != recipient:
                        raise ValueError("Test key already belongs to another recipient")
                    return {
                        "status": "already_sent" if item.status == "sent" else item.status,
                        "accepted": item.status == "sent",
                        "duplicate": True,
                        "outbox_id": item.id,
                        "message_id": item.gmail_message_id,
                        "error_code": item.last_error,
                    }
                item = Outbox(
                    event_key=event_key,
                    recipient=recipient,
                    subject="Vacaciones · Prueba de correo SMTP",
                    template="smtp-test.html",
                    context={},
                    status="sending",
                    attempts=1,
                )
                db.add(item)
                db.flush()
                audit(db, None, "mail.test_requested", item.id)
                db.commit()  # Persist before any network operation; crash cannot cause a retry.
                body = (
                    "Mensaje de prueba de Vacaciones enviado para comprobar "
                    "el servicio de correo.\n"
                    "No contiene contraseñas ni datos de empleados.\n"
                    "Aplicación: " + settings.app_url
                )
                try:
                    item.gmail_message_id = transport.send(
                        recipient,
                        item.subject,
                        "<h1>Prueba de correo de Vacaciones</h1><p>"
                        + escape(body).replace("\n", "</p><p>")
                        + "</p>",
                        body,
                        item.id,
                    )
                    item.status = "sent"
                    item.last_error = None
                except DeliveryError as exc:
                    # This diagnostic must not become a recurring/retryable notification.
                    item.status = "uncertain" if exc.state == "uncertain" else "failed"
                    item.last_error = exc.code
                except Exception:
                    item.status = "uncertain"
                    item.last_error = "DELIVERY_INTERNAL_ERROR"
                audit(db, None, "mail.test_" + item.status, item.id)
                db.commit()
                return {
                    "status": item.status,
                    "accepted": item.status == "sent",
                    "duplicate": False,
                    "outbox_id": item.id,
                    "message_id": item.gmail_message_id,
                    "error_code": item.last_error,
                }
        finally:
            connection.rollback()
            connection.execute(text(f"SELECT pg_advisory_unlock({OUTBOX_LOCK})"))
            connection.commit()
            transport.close()
