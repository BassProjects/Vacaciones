"""Invitation-only registration, separate from password recovery and suspension."""

from fastapi import APIRouter, Depends, Request
from pydantic import Field, field_validator, model_validator

from app.db import audit, get_db, lock_configuration
from app.onboarding import revoke_activation, valid_activation
from app.permissions import today
from app.schemas import ISODate, Password, Payload, ShortText
from app.security import hash_password, revoke_sessions, throttle

router = APIRouter(prefix="/api/activation", tags=["Registro por invitación"])


class ActivationRequest(Payload):
    token: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")


class CompleteActivation(ActivationRequest):
    name: ShortText
    birth_date: ISODate
    new_password: Password
    confirm_password: Password
    share_birthday: bool = Field(default=False, strict=True)

    @field_validator("name")
    @classmethod
    def require_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("El nombre es obligatorio")
        return value

    @field_validator("birth_date")
    @classmethod
    def past_birthday(cls, value):
        if value >= today():
            raise ValueError("La fecha de nacimiento debe ser anterior a hoy")
        return value

    @model_validator(mode="after")
    def matching_passwords(self):
        if self.new_password != self.confirm_password:
            raise ValueError("Las contraseñas no coinciden")
        return self


@router.post("/inspect")
def inspect_link(payload: ActivationRequest, request: Request, db=Depends(get_db)):
    address = request.client.host if request.client else "unknown"
    throttle(db, "activation-inspect:" + address, limit=120)
    _, user = valid_activation(db, payload.token)
    # Only the token holder sees the identity bound to the invitation, never its credentials.
    return {"name": user.name, "email": user.email, "username": user.username}


@router.post("/complete")
def complete(payload: CompleteActivation, request: Request, db=Depends(get_db)):
    address = request.client.host if request.client else "unknown"
    throttle(db, "activation-complete:" + address, limit=30)
    lock_configuration(db)
    _, user = valid_activation(db, payload.token, for_update=True)
    user.password_hash, user.password_salt, user.password_scheme = hash_password(
        payload.new_password
    )
    user.name = payload.name
    user.birth_date = payload.birth_date
    user.share_birthday = payload.share_birthday
    user.onboarding_pending = False
    user.must_change_password = False
    revoke_sessions(db, user.id)
    revoke_activation(db, user.id, "REGISTRATION_COMPLETED")
    audit(db, user, "employee.registered", user.id, request=request)
    db.commit()
    return {"ok": True, "username": user.username, "loginRequired": True}
