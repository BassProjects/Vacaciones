"""Explicit administrator actions. Deletion never cascades through business history."""

import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field
from sqlalchemy import delete, or_, select, update

from app.db import audit, get_db, lock_configuration
from app.invitation_delivery import delivery_state
from app.models import (
    ActivationToken,
    Attachment,
    Delegation,
    Employee,
    ImportBatch,
    LeaveRequest,
    Outbox,
    PasswordReset,
    Policy,
)
from app.onboarding import lock_mail_changes, queue_activation, revoke_activation
from app.routes.users import check_last_admin
from app.schemas import Payload
from app.security import administrator, revoke_sessions, throttle

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
    if not employee:
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
    # Historic resolution/upload attribution stores names; preserve that history too.
    identities = [user_id, employee.name]
    references = [
        (
            LeaveRequest,
            or_(LeaveRequest.user_id == user_id, LeaveRequest.resolved_by.in_(identities)),
        ),
        (Policy, Policy.user_id == user_id),
        (Delegation, or_(Delegation.manager_id == user_id, Delegation.delegate_id == user_id)),
        (ImportBatch, ImportBatch.user_id == user_id),
        (Attachment, Attachment.uploaded_by.in_(identities)),
    ]
    for model, condition in references:
        if db.scalar(select(model).where(condition).limit(1)):
            raise HTTPException(
                409,
                "Este trabajador tiene historial, solicitudes o datos asociados. "
                "Desactívalo para conservarlos; no se ha eliminado nada.",
            )
    revoke_activation(db, user_id, "RECIPIENT_REMOVED")
    if employee.email:
        db.execute(
            update(Outbox)
            .where(Outbox.recipient == employee.email, Outbox.status == "pending")
            .values(status="failed", last_error="RECIPIENT_REMOVED")
        )
    revoke_sessions(db, user_id)
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user_id))
    db.execute(delete(ActivationToken).where(ActivationToken.user_id == user_id))
    audit(db, me, "employee.deleted", user_id, request=request)
    db.delete(employee)
    db.commit()
    return {"ok": True, "deleted": True, "auditPreserved": True}


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
