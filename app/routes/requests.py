import re
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select

from app.balances import balance
from app.constants import ABSENCE_TYPES
from app.db import get_db
from app.leave_service import create_request, preview, resolve_request
from app.models import AuditEvent, Configuration, Department, Employee, Holiday, LeaveRequest
from app.permissions import (
    can_view_private,
    managed_departments,
    request_json,
    today,
    user_json,
)
from app.reporting import dashboard
from app.schemas import RequestCreate, Resolution
from app.security import current_user

router = APIRouter(tags=["Calendario y solicitudes"])


def visible_query(me, departments):
    query = select(LeaveRequest)
    if me.role != "admin":
        query = query.where(
            or_(
                LeaveRequest.user_id == me.id,
                LeaveRequest.department.in_(departments),
                LeaveRequest.status == "approved",
            )
        )
    return query


@router.get("/api/bootstrap")
def bootstrap(
    year: int | None = Query(default=None, ge=1900, le=2200),
    me=Depends(current_user),
    db=Depends(get_db),
):
    year = year if year is not None else today().year
    departments = managed_departments(db, me)
    configuration = db.get(Configuration, 1)
    if not configuration:
        raise HTTPException(503, "Configuración pendiente")
    users = list(db.scalars(select(Employee).order_by(Employee.name))) if me.role == "admin" else []
    roster_rows = list(
        db.scalars(select(Employee).where(Employee.active.is_(True)).order_by(Employee.name))
    )
    rows = list(
        db.scalars(
            visible_query(me, departments)
            .where(
                LeaveRequest.date_from <= date(year, 12, 31),
                LeaveRequest.date_to >= date(year, 1, 1),
            )
            .order_by(LeaveRequest.requested_at.desc(), LeaveRequest.id)
            .limit(200)
        )
    )
    all_departments = list(db.scalars(select(Department).order_by(Department.name)))
    # Global team views never need private notes, email addresses or medical absence labels.
    roster = [
        {"id": u.id, "name": u.name, "department": u.department, "role": u.role, "avatarUrl": None}
        for u in roster_rows
    ]
    birthdays = [
        {
            "userId": u.id,
            "name": u.name,
            "department": u.department,
            "month": u.birth_date.month,
            "day": u.birth_date.day,
        }
        for u in roster_rows
        if u.birth_date and u.share_birthday
    ]
    holidays = [
        {"date": h.date.isoformat(), "name": h.name, "calendarId": h.calendar_id}
        for h in db.scalars(
            select(Holiday).where(Holiday.calendar_id == me.calendar_id).order_by(Holiday.date)
        )
    ]
    balance_users = (
        users
        if me.role == "admin"
        else [u for u in roster_rows if u.id == me.id or u.department in departments]
    )
    balances = {
        u.id: {str(y): balance(db, u, y) for y in sorted({year, today().year})}
        for u in balance_users
    }
    return {
        "me": user_json(me),
        "config": {
            "defaultAllowance": float(configuration.default_allowance),
            "overAllowance": configuration.over_allowance,
            "maxAwayPercent": configuration.max_away_percent,
        },
        "departments": [{"id": d.id, "name": d.name, "color": d.color} for d in all_departments],
        "absenceTypes": ABSENCE_TYPES,
        "holidays": holidays,
        "requests": [request_json(r, me, departments) for r in rows],
        "requestsPageSize": 200,
        "requestsYear": year,
        "users": [user_json(u) for u in users],
        "birthdays": birthdays,
        "roster": roster,
        "balances": balances,
        "adminReport": dashboard(db, year, all_departments, configuration.max_away_percent)
        if me.role == "admin"
        else None,
        "managedDepartments": sorted(departments),
        "serverDate": today().isoformat(),
    }


@router.get("/api/requests")
def list_requests(
    year: int | None = Query(default=None, ge=1900, le=2200),
    page: int = Query(default=1, ge=1, le=100000),
    page_size: int = Query(default=200, ge=1, le=200),
    me=Depends(current_user),
    db=Depends(get_db),
):
    year = year if year is not None else today().year
    departments = managed_departments(db, me)
    query = visible_query(me, departments).where(
        LeaveRequest.date_from <= date(year, 12, 31), LeaveRequest.date_to >= date(year, 1, 1)
    )
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(
        query.order_by(LeaveRequest.requested_at.desc(), LeaveRequest.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return {
        "requests": [request_json(r, me, departments) for r in rows],
        "page": page,
        "pageSize": page_size,
        "total": total,
        "hasMore": page * page_size < total,
    }


@router.get("/api/balances/{user_id}/{year}")
def employee_balance(user_id: str, year: int, me=Depends(current_user), db=Depends(get_db)):
    if not 1900 <= year <= 2200:
        raise HTTPException(400, "Año no válido")
    employee = db.get(Employee, user_id)
    if not employee:
        raise HTTPException(404, "Empleado no encontrado")
    if (
        me.role != "admin"
        and me.id != user_id
        and employee.department not in managed_departments(db, me)
    ):
        raise HTTPException(403, "No autorizado")
    return balance(db, employee, year)


@router.post("/api/requests/preview")
def preview_request(payload: RequestCreate, me=Depends(current_user), db=Depends(get_db)):
    return preview(db, me, payload)


@router.post("/api/requests")
def submit_request(
    payload: RequestCreate, request: Request, me=Depends(current_user), db=Depends(get_db)
):
    key = request.headers.get("idempotency-key", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,80}", key):
        raise HTTPException(400, "Se requiere una clave de reintento válida")
    item, duplicate = create_request(db, me, payload, key, request)
    return {"id": item.id, "days": float(item.days), "duplicate": duplicate}


@router.get("/api/requests/{request_id}")
def get_request(request_id: str, me=Depends(current_user), db=Depends(get_db)):
    item = db.get(LeaveRequest, request_id)
    departments = managed_departments(db, me)
    if not item or not can_view_private(me, item, departments):
        raise HTTPException(404, "Solicitud no encontrada")
    result = request_json(item, me, departments)
    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.entity_id == request_id)
        .order_by(AuditEvent.created_at, AuditEvent.id)
    )
    result["history"] = [
        {
            "id": e.id,
            "action": e.action,
            "actorId": e.actor_id,
            "at": e.created_at.isoformat(),
            "details": e.details,
        }
        for e in events
    ]
    return result


@router.patch("/api/requests/{request_id}")
def resolve(
    request_id: str,
    payload: Resolution,
    request: Request,
    me=Depends(current_user),
    db=Depends(get_db),
):
    item = resolve_request(db, me, request_id, payload, request)
    return {"ok": True, "status": item.status}
