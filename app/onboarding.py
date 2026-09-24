"""Single-use employee activation. Raw tokens only exist in the outgoing message."""

import secrets
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import or_, select, text, update

from app.db import lock_configuration
from app.models import ActivationToken, Employee, Outbox, PasswordReset, new_id, now
from app.security import digest

ACTIVATION_HOURS = 48
OUTBOX_LOCK = 768429115


def lock_mail_changes(db):
    """Exclude the mail worker before invalidating a recipient or deleting an account."""
    if not db.scalar(text(f"SELECT pg_try_advisory_xact_lock({OUTBOX_LOCK})")):
        raise HTTPException(
            409, "El servicio de correo está procesando un envío. Repite la acción."
        )


def invitation_filter(user_id):
    return or_(
        Outbox.event_key == "invite:" + user_id,
        Outbox.context["user_id"].astext == user_id,
    )


def revoke_activation(db, user_id, reason="INVITATION_REPLACED"):
    db.execute(update(ActivationToken).where(ActivationToken.user_id == user_id).values(used=True))
    db.execute(update(PasswordReset).where(PasswordReset.user_id == user_id).values(used=True))
    db.execute(
        update(Outbox)
        .where(
            Outbox.event_key.startswith("invite:"),
            invitation_filter(user_id),
            Outbox.status == "pending",
        )
        .values(status="failed", last_error=reason)
    )


def queue_activation(db, user, event_key=None):
    item = Outbox(
        id=new_id(),
        event_key=event_key or "invite:" + user.id,
        recipient=user.email,
        subject="Activa tu cuenta de Vacaciones",
        template="registration.html",
        context={"name": user.name, "user_id": user.id},
    )
    db.add(item)
    return item


def prepare_activation(db, item, settings):
    """Run under the worker's lock; create token immediately before the send attempt."""
    lock_configuration(db)
    user_id = item.context.get("user_id") or item.event_key.split(":")[1]
    user = db.get(Employee, user_id)
    if (
        not user
        or user.deleted_at is not None
        or not user.active
        or not user.onboarding_pending
        or user.email != item.recipient
    ):
        return None
    db.execute(update(ActivationToken).where(ActivationToken.user_id == user.id).values(used=True))
    raw = secrets.token_urlsafe(32)
    db.add(
        ActivationToken(
            token_hash=digest(raw),
            user_id=user.id,
            email=user.email,
            expires_at=now() + timedelta(hours=ACTIVATION_HOURS),
        )
    )
    return {
        "name": user.name,
        "username": user.username,
        "app_url": settings.app_url,
        "activation_url": settings.app_url + "/activate#token=" + raw,
        "valid_hours": ACTIVATION_HOURS,
    }


def valid_activation(db, raw, *, for_update=False):
    query = select(ActivationToken).where(ActivationToken.token_hash == digest(raw))
    if for_update:
        query = query.with_for_update()
    link = db.scalar(query)
    user = db.get(Employee, link.user_id) if link else None
    if (
        not link
        or link.used
        or link.expires_at <= now()
        or not user
        or user.deleted_at is not None
        or not user.active
        or not user.onboarding_pending
        or user.email != link.email
    ):
        raise HTTPException(
            400, "El enlace no es válido o ha caducado. Solicita otro a administración."
        )
    return link, user
