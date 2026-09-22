import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select

from app.db import audit, get_db
from app.mailer import queue_password_link
from app.models import Employee, PasswordReset, SessionToken, now
from app.permissions import user_json
from app.schemas import ChangePassword, CompleteReset, ForgotPassword, Login
from app.security import (
    SESSION_COOKIE,
    current_user,
    digest,
    hash_password,
    issue_session,
    revoke_sessions,
    throttle,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["Autenticación"])
DUMMY_HASH, DUMMY_SALT, DUMMY_SCHEME = hash_password("synthetic-not-an-account-password")


@router.get("/me")
def me(request: Request, db=Depends(get_db)):
    try:
        user = current_user(request, db)
    except HTTPException as exc:
        if exc.status_code == 401:
            return {"user": None}
        raise
    return {"user": user_json(user)}


@router.post("/login")
def login(payload: Login, request: Request, db=Depends(get_db)):
    username = payload.username.strip().lower()
    address = request.client.host if request.client else "unknown"
    throttle(db, "login-ip:" + address, limit=300)
    throttle(db, "login-user:" + username)
    user = db.scalar(select(Employee).where(Employee.username == username))
    valid = verify_password(
        payload.password,
        user.password_hash if user else DUMMY_HASH,
        user.password_salt if user else DUMMY_SALT,
        user.password_scheme if user else DUMMY_SCHEME,
    )
    if not valid or not user or not user.active:
        raise HTTPException(401, "Usuario o contraseña incorrectos")
    if user.password_scheme == "scrypt-node-v1":
        user.password_hash, user.password_salt, user.password_scheme = (
            hash_password(payload.password)
            if len(payload.password) >= 12
            else (user.password_hash, user.password_salt, user.password_scheme)
        )
        if len(payload.password) < 12:
            user.must_change_password = True
    response = JSONResponse({"user": user_json(user)})
    issue_session(db, user, response, request.app.state.settings)
    audit(db, user, "auth.login", user.id, request=request)
    db.commit()
    return response


@router.post("/logout")
def logout(request: Request, db=Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE, "")
    db.execute(delete(SessionToken).where(SessionToken.token_hash == digest(token)))
    db.commit()
    response = JSONResponse({"ok": True})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@router.post("/change-password")
def change_password(
    payload: ChangePassword, request: Request, user=Depends(current_user), db=Depends(get_db)
):
    throttle(db, "change-password:" + user.id, limit=10)
    user = db.scalar(select(Employee).where(Employee.id == user.id).with_for_update())
    if not verify_password(
        payload.current_password, user.password_hash, user.password_salt, user.password_scheme
    ):
        raise HTTPException(400, "La contraseña actual no es correcta")
    user.password_hash, user.password_salt, user.password_scheme = hash_password(
        payload.new_password
    )
    user.must_change_password = False
    revoke_sessions(db, user.id)
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    audit(db, user, "auth.password_changed", user.id, request=request)
    db.commit()
    response = JSONResponse({"ok": True, "loginRequired": True})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@router.post("/forgot-password")
def forgot_password(payload: ForgotPassword, request: Request, db=Depends(get_db)):
    address = request.client.host if request.client else "unknown"
    throttle(db, "forgot-ip:" + address, limit=30)
    throttle(db, "forgot-email:" + str(payload.email).lower(), limit=3, minutes=60)
    user = db.scalar(
        select(Employee).where(
            Employee.email == str(payload.email).lower(), Employee.active.is_(True)
        )
    )
    if user and request.app.state.settings.mail_enabled:
        queue_password_link(db, user, "reset:" + secrets.token_hex(16))
        db.commit()
    return {
        "ok": True,
        "message": "Si la cuenta existe y el correo está configurado, recibirás instrucciones.",
    }


@router.post("/reset-password")
def reset_password(payload: CompleteReset, request: Request, db=Depends(get_db)):
    address = request.client.host if request.client else "unknown"
    throttle(db, "reset-ip:" + address, limit=30)
    link = db.scalar(
        select(PasswordReset)
        .where(PasswordReset.token_hash == digest(payload.token))
        .with_for_update()
    )
    if not link or link.used or link.expires_at <= now():
        raise HTTPException(400, "Enlace no válido o caducado")
    user = db.get(Employee, link.user_id)
    if not user or not user.active:
        raise HTTPException(400, "Enlace no válido o caducado")
    user.password_hash, user.password_salt, user.password_scheme = hash_password(
        payload.new_password
    )
    user.must_change_password = False
    link.used = True
    revoke_sessions(db, user.id)
    audit(db, user, "auth.password_reset", user.id, request=request)
    db.commit()
    return {"ok": True}
