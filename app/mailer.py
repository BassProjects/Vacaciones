"""Bounded transactional outbox using SMTP. No OAuth or background web worker."""

import secrets
import time
from datetime import timedelta
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from app.db import lock_configuration
from app.models import Employee, Outbox, PasswordReset, now
from app.onboarding import prepare_activation, queue_activation
from app.security import digest
from app.smtp_transport import DeliveryError, SMTPTransport

TEMPLATES = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates" / "email"),
    autoescape=select_autoescape(["html", "xml"]),
)


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
    # Self-service password recovery remains separate from invitation-only registration.
    if not invitation:
        return False
    queue_activation(db, user, event_key)
    return True


def drain(database, settings, limit=10, seconds=45, transport=None):
    counts = {"sent": 0, "pending": 0, "failed": 0, "uncertain": 0}
    if not settings.mail_enabled:
        return {**counts, "disabled": True}
    started = time.monotonic()
    transport = transport or SMTPTransport(settings)
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
                    # Same lock order as registration: configuration, then outbox/token rows.
                    lock_configuration(db)
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
                    template = item.template
                    if template in {
                        "registration.html",
                        "welcome.html",
                    } and item.event_key.startswith("invite:"):
                        context = prepare_activation(db, item, settings)
                        if context is None:
                            item.status, item.last_error = "failed", "INVITATION_NOT_ACTIVE"
                            counts["failed"] += 1
                            db.commit()
                            continue
                        template = "registration.html"
                    elif template == "password.html":
                        user = db.get(Employee, context["user_id"])
                        if not user or not user.active or user.onboarding_pending:
                            item.status, item.last_error = "failed", "RECIPIENT_NOT_ACTIVE"
                            counts["failed"] += 1
                            db.commit()
                            continue
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
                        html = TEMPLATES.get_template(template).render(**context)
                        if "activation_url" in context:
                            text_body = (
                                "Completa tu registro de Vacaciones: "
                                + context["activation_url"]
                                + "\nCrea tu contraseña y completa tu nombre y fecha de nacimiento."
                                + "\nEl enlace es de un solo uso y caduca en 48 horas."
                            )
                        else:
                            text_body = (
                                "Accede a "
                                + context.get("reset_url", settings.app_url)
                                + " para consultar esta notificación de vacaciones."
                            )
                        item.gmail_message_id = transport.send(
                            item.recipient, item.subject, html, text_body, item.id
                        )
                        item.status, item.last_error = "sent", None
                    except DeliveryError as exc:
                        item.status = (
                            "failed" if item.attempts >= 8 and exc.state == "pending" else exc.state
                        )
                        item.last_error = exc.code
                        item.available_at = now() + timedelta(
                            seconds=min(3600, max(exc.retry_after, 30 * 2 ** min(item.attempts, 7)))
                        )
                    except Exception:
                        item.status, item.last_error = "uncertain", "DELIVERY_INTERNAL_ERROR"
                    counts[item.status] = counts.get(item.status, 0) + 1
                    db.commit()
        finally:
            connection.rollback()
            connection.execute(text("SELECT pg_advisory_unlock(768429115)"))
            connection.commit()
            transport.close()
    return counts
