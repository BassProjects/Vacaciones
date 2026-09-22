"""Opaque, revocable sessions and bounded password verification."""

import hashlib
import hmac
import re
import secrets
import threading
from datetime import timedelta

from fastapi import Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from app.db import get_db
from app.models import AuthThrottle, Employee, SessionToken, now

SESSION_COOKIE = "vac_session_v2"
CSRF_COOKIE = "vac_csrf_v2"
PASSWORD_SLOTS = threading.BoundedSemaphore(2)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def csrf_for(session_token: str) -> str:
    return hmac.new(session_token.encode(), b"vacaciones-csrf-v2", hashlib.sha256).hexdigest()


def hash_password(password: str):
    if not isinstance(password, str) or not 12 <= len(password) <= 256:
        raise ValueError("La contraseña debe tener entre 12 y 256 caracteres")
    salt = secrets.token_hex(16)
    with PASSWORD_SLOTS:
        result = hashlib.scrypt(
            password.encode(),
            salt=salt.encode(),
            n=32768,
            r=8,
            p=1,
            dklen=64,
            maxmem=64 * 1024 * 1024,
        )
    return result.hex(), salt, "scrypt-v2"


def verify_password(password, password_hash, salt, scheme="scrypt-node-v1"):
    if not isinstance(password, str) or len(password) > 256:
        return False
    if scheme not in {"scrypt-node-v1", "scrypt-v2"}:
        return False
    if not re.fullmatch(r"[a-f0-9]{128}", password_hash or ""):
        return False
    if not re.fullmatch(r"[a-f0-9]{32}", salt or ""):
        return False
    with PASSWORD_SLOTS:
        value = hashlib.scrypt(
            password.encode(),
            salt=salt.encode(),
            n=32768 if scheme == "scrypt-v2" else 16384,
            r=8,
            p=1,
            dklen=64,
            maxmem=64 * 1024 * 1024,
        )
    return hmac.compare_digest(value.hex(), password_hash)


def throttle(db, key, limit=10, minutes=15):
    """Persistent atomic counter: restarting the web worker does not reset it."""
    key = digest(key)
    instant = now()
    db.execute(
        insert(AuthThrottle)
        .values(key=key, count=0, expires_at=instant + timedelta(minutes=minutes))
        .on_conflict_do_nothing()
    )
    bucket = db.scalar(select(AuthThrottle).where(AuthThrottle.key == key).with_for_update())
    if bucket.expires_at <= instant:
        bucket.count = 0
        bucket.expires_at = instant + timedelta(minutes=minutes)
    bucket.count += 1
    blocked = bucket.count > limit
    db.commit()
    if blocked:
        raise HTTPException(
            429,
            "Demasiados intentos. Inténtalo más tarde",
            headers={"Retry-After": str(minutes * 60)},
        )


def current_user(request: Request, db=Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE, "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        raise HTTPException(401, "No autenticado")
    user = db.scalar(
        select(Employee)
        .join(SessionToken, SessionToken.user_id == Employee.id)
        .where(
            SessionToken.token_hash == digest(token),
            SessionToken.expires_at > now(),
            Employee.active.is_(True),
        )
    )
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.must_change_password and request.url.path not in {
        "/api/auth/me",
        "/api/auth/change-password",
        "/api/auth/logout",
    }:
        raise HTTPException(403, "Debes cambiar tu contraseña antes de continuar")
    return user


def administrator(me=Depends(current_user)):
    if me.role != "admin":
        raise HTTPException(403, "No autorizado")
    return me


def revoke_sessions(db, user_id):
    db.execute(delete(SessionToken).where(SessionToken.user_id == user_id))


def issue_session(db, user, response, settings):
    token = secrets.token_urlsafe(32)
    db.add(
        SessionToken(
            token_hash=digest(token),
            user_id=user.id,
            expires_at=now() + timedelta(hours=settings.session_hours),
        )
    )
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=settings.session_hours * 3600,
        path="/",
    )
    response.set_cookie(
        CSRF_COOKIE,
        csrf_for(token),
        httponly=False,
        secure=settings.secure_cookies,
        samesite="strict",
        max_age=settings.session_hours * 3600,
        path="/",
    )
