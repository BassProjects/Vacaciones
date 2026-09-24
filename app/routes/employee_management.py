"""Explicit administrator actions. Deletion never cascades through business history."""

import re
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field
from sqlalchemy import delete, select, update

from app.db import audit, get_db, lock_configuration
from app.invitation_delivery import delivery_state
from app.models import ActivationToken, Employee, Outbox, PasswordReset, now
from app.onboarding import lock_mail_changes, queue_activation, revoke_activation
from app.routes.users import check_last_admin
from app.schemas import Payload
from app.security import administrator, hash_password, revoke_sessions, throttle

router = APIRouter(prefix="/api/users", tags=["Gestión de trabajadores"])


class DeleteEmployee(Payload):
    confirmation: str = Field(min_length=1, max_length=80, strict=True)


def locked_employee(db, user_id, me):
    lock_mail_changes(db)
    lock_configuration(db)
    db.refresh(me)
    if not me.active or me.onboarding_pending or me.role != "admin":
        raise HTTPException(403, "No autorizado")
    employee = db.get(Employee, user_id)
    if not employee or employee.deleted_at is not None:
        raise HTTPException(404, "Empleado no encontrado")
    return employee


@router.post("/{user_id}/remove")
def remove_employee(
    user_id: str,
    payload: DeleteEmployee,
    request: Request,
    me=Depends(administrator),
    db=Depends(get_db),
):
    employee = locked_employee(db, user_id, me)
    if employee.id == me.id:
        raise HTTPException(409, "No puedes eliminar tu propia cuenta")
    check_last_admin(db, employee, employee.role, False)
    if payload.confirmation != employee.username:
        raise HTTPException(400, "Escribe el usuario exacto para confirmar la eliminación")
    original_email = employee.email
    original_username = employee.username
    revoke_activation(db, user_id, "RECIPIENT_REMOVED")
    if original_email:
        db.execute(
            update(Outbox)
            .where(Outbox.recipient == original_email, Outbox.status == "pending")
            .values(status="failed", last_error="RECIPIENT_REMOVED")
        )
    revoke_sessions(db, user_id)
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user_id))
    db.execute(delete(ActivationToken).where(ActivationToken.user_id == user_id))
    employee.active = False
    employee.deleted_at = now()
    employee.email = None
    employee.username = "deleted-" + employee.id
    employee.onboarding_pending = False
    employee.must_change_password = False
    employee.birth_date = None
    employee.share_birthday = False
    employee.password_hash, employee.password_salt, employee.password_scheme = hash_password(
        secrets.token_urlsafe(48)
    )
    audit(
        db,
        me,
        "employee.deleted",
        user_id,
        {"username": original_username, "history_preserved": True},
        request,
    )
    db.commit()
    return {
        "ok": True,
        "deleted": True,
        "historyPreserved": True,
        "removedFromEmployees": True,
    }


@router.post("/{user_id}/activation-link")
def resend_activation(
    user_id: str, request: Request, me=Depends(administrator), db=Depends(get_db)
):
    key = request.headers.get("Idempotency-Key", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", key):
        raise HTTPException(400, "La petición necesita un identificador de envío válido")
    throttle(db, "resend-activation:" + user_id, limit=5, minutes=60)
    user = locked_employee(db, user_id, me)
    if not request.app.state.settings.mail_enabled:
        raise HTTPException(503, "El correo no está activado")
    if not user.active or not user.onboarding_pending or not user.email:
        raise HTTPException(
            409, "Solo se envían enlaces a cuentas habilitadas pendientes de registro"
        )
    event_key = "invite:" + user.id + ":" + key
    existing = db.scalar(select(Outbox).where(Outbox.event_key == event_key))
    if existing:
        return {"ok": True, "duplicate": True, **delivery_state(existing)}
    revoke_activation(db, user_id)
    item = queue_activation(db, user, event_key)
    audit(db, me, "employee.activation_requested", user_id, {"mail_id": item.id}, request)
    db.commit()
    return {"ok": True, "duplicate": False, **delivery_state(item)}
