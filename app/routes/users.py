import secrets
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select, update

from app.db import audit, get_db, lock_configuration
from app.mailer import queue_password_link
from app.models import Calendar, Department, Employee, PasswordReset, new_id
from app.permissions import user_json
from app.schemas import EmployeeCreate, EmployeeUpdate, Invitations, ResetPassword
from app.security import administrator, current_user, hash_password, revoke_sessions

router = APIRouter(prefix="/api/users", tags=["Empleados"])


def department_valid(db, department, role):
    if department and not db.get(Department, department):
        raise HTTPException(400, "Departamento no válido")
    if role == "manager" and not department:
        raise HTTPException(400, "Un responsable necesita departamento")


def check_last_admin(db, employee, next_role, next_active):
    if employee.role == "admin" and employee.active and (next_role != "admin" or not next_active):
        count = db.scalar(
            select(func.count())
            .select_from(Employee)
            .where(Employee.role == "admin", Employee.active.is_(True), Employee.id != employee.id)
        )
        if not count:
            raise HTTPException(
                409, "No puedes desactivar ni quitar el rol al último administrador activo"
            )


def uniqueness(db, email=None, username=None, exclude_id=None):
    for field, value, label in [
        (Employee.email, email, "correo"),
        (Employee.username, username, "usuario"),
    ]:
        if value is None:
            continue
        query = select(Employee.id).where(field == value)
        if exclude_id:
            query = query.where(Employee.id != exclude_id)
        if db.scalar(query.limit(1)):
            raise HTTPException(409, f"Ya existe una cuenta con ese {label}")


@router.post("")
def create_employee(
    payload: EmployeeCreate, request: Request, me=Depends(administrator), db=Depends(get_db)
):
    lock_configuration(db)
    department_valid(db, payload.department, payload.role)
    email, username = str(payload.email).lower(), payload.username.strip().lower()
    uniqueness(db, email, username)
    password_hash, salt, scheme = hash_password(payload.password)
    item = Employee(
        id=new_id(),
        name=payload.name.strip(),
        email=email,
        username=username,
        password_hash=password_hash,
        password_salt=salt,
        password_scheme=scheme,
        department=payload.department,
        role=payload.role,
        allowance_override=payload.allowance_override,
        birth_date=payload.birth_date,
        share_birthday=payload.share_birthday,
        must_change_password=True,
        calendar_id="default",
    )
    if not item.name:
        raise HTTPException(400, "El nombre es obligatorio")
    db.add(item)
    db.flush()
    audit(db, me, "employee.created", item.id, {"role": item.role}, request)
    db.commit()
    return {"id": item.id}


@router.patch("/{user_id}")
def edit_employee(
    user_id: str,
    payload: EmployeeUpdate,
    request: Request,
    me=Depends(current_user),
    db=Depends(get_db),
):
    lock_configuration(db)
    db.refresh(me)
    is_admin = me.role == "admin"
    changes = payload.model_dump(exclude_unset=True)
    if not is_admin:
        if me.id != user_id or set(changes) - {"name", "email", "birth_date", "share_birthday"}:
            raise HTTPException(403, "No autorizado")
    employee = db.get(Employee, user_id)
    if not employee:
        raise HTTPException(404, "Empleado no encontrado")
    for key in ("name", "email", "role", "active", "calendar_id", "work_hours", "share_birthday"):
        if key in changes and changes[key] is None:
            raise HTTPException(400, "No se admite un valor vacío en " + key)
    role, active = changes.get("role", employee.role), changes.get("active", employee.active)
    check_last_admin(db, employee, role, active)
    department_valid(db, changes.get("department", employee.department), role)
    if "calendar_id" in changes and not db.get(Calendar, changes["calendar_id"]):
        raise HTTPException(400, "Calendario no válido")
    if "name" in changes:
        changes["name"] = changes["name"].strip()
        if not changes["name"]:
            raise HTTPException(400, "El nombre es obligatorio")
    if "email" in changes:
        changes["email"] = str(changes["email"]).lower()
        uniqueness(db, email=changes["email"], exclude_id=user_id)
    if "work_hours" in changes:
        changes["work_hours"] = {k: str(v) for k, v in changes["work_hours"].items()}
    beginning = changes.get("employed_from", employee.employed_from)
    end = changes.get("employed_to", employee.employed_to)
    if beginning and end and end < beginning:
        raise HTTPException(400, "Las fechas de empleo no están ordenadas")
    for key, value in changes.items():
        setattr(employee, key, value)
    if set(changes) & {"role", "active", "department"}:
        revoke_sessions(db, employee.id)
    audit(db, me, "employee.updated", employee.id, {"fields": sorted(changes)}, request)
    db.commit()
    return {"ok": True, "user": user_json(employee)}


@router.delete("/{user_id}")
def deactivate_employee(
    user_id: str, request: Request, me=Depends(administrator), db=Depends(get_db)
):
    lock_configuration(db)
    employee = db.get(Employee, user_id)
    if not employee:
        raise HTTPException(404, "Empleado no encontrado")
    if employee.id == me.id:
        raise HTTPException(409, "No puedes desactivar tu propia cuenta desde esta acción")
    check_last_admin(db, employee, employee.role, False)
    employee.active = False
    revoke_sessions(db, employee.id)
    audit(db, me, "employee.deactivated", employee.id, request=request)
    db.commit()
    return {"ok": True, "deactivated": True, "historyPreserved": True}


@router.post("/{user_id}/reset-password")
def reset_employee_password(
    user_id: str,
    payload: ResetPassword,
    request: Request,
    me=Depends(administrator),
    db=Depends(get_db),
):
    lock_configuration(db)
    employee = db.get(Employee, user_id)
    if not employee:
        raise HTTPException(404, "Empleado no encontrado")
    employee.password_hash, employee.password_salt, employee.password_scheme = hash_password(
        payload.new_password
    )
    employee.must_change_password = True
    revoke_sessions(db, user_id)
    db.execute(update(PasswordReset).where(PasswordReset.user_id == user_id).values(used=True))
    audit(db, me, "employee.password_reset", user_id, request=request)
    db.commit()
    return {"ok": True}


@router.post("/invite")
def invite_employees(
    payload: Invitations, request: Request, me=Depends(administrator), db=Depends(get_db)
):
    if not request.app.state.settings.mail_enabled:
        raise HTTPException(503, "Las invitaciones necesitan que SMTP esté configurado y activado")
    lock_configuration(db)
    department_valid(db, payload.department, payload.role)
    from pydantic import EmailStr, TypeAdapter

    validator = TypeAdapter(EmailStr)
    created, skipped, failed = [], [], []
    for raw in payload.lines:
        parts = [x.strip() for x in raw.split(",")]
        email = parts[-1].lower()
        try:
            email = str(validator.validate_python(email))
        except ValueError:
            failed.append({"line": raw[:200], "error": "Correo no válido"})
            continue
        if db.scalar(select(Employee.id).where(Employee.email == email)):
            skipped.append(email)
            continue
        name = parts[0] if len(parts) > 1 else email.split("@")[0].replace(".", " ").title()
        if not 1 <= len(name) <= 160:
            failed.append({"line": raw[:200], "error": "Nombre no válido"})
            continue
        base = (
            "".join(
                c
                for c in unicodedata.normalize("NFKD", email.split("@")[0])
                if c.isascii() and (c.isalnum() or c in "._-")
            )[:60]
            or "usuario"
        )
        username, suffix = base, 1
        while db.scalar(select(Employee.id).where(Employee.username == username)):
            suffix += 1
            username = f"{base}{suffix}"
        password_hash, salt, scheme = hash_password(secrets.token_urlsafe(48))
        user = Employee(
            id=new_id(),
            name=name,
            email=email,
            username=username,
            password_hash=password_hash,
            password_salt=salt,
            password_scheme=scheme,
            role=payload.role,
            department=payload.department,
            must_change_password=True,
        )
        db.add(user)
        db.flush()
        queue_password_link(db, user, "invite:" + user.id, invitation=True)
        audit(db, me, "employee.invited", user.id, {"role": user.role}, request)
        created.append(
            {
                "name": name,
                "email": email,
                "username": username,
                "mailSent": False,
                "mailQueued": True,
            }
        )
    db.commit()
    return {"created": created, "skipped": skipped, "failed": failed}
