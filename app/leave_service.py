"""Transactional leave rules shared by the API and import procedures."""

import json
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select

from app.balances import allowance_shortfalls, balance, effective_policy
from app.calendar_rules import DayAllocation, allocate_days
from app.db import audit, lock_configuration
from app.mailer import queue_mail
from app.models import (
    Department,
    Employee,
    Holiday,
    LeaveRequest,
    RequestDay,
    new_id,
    now,
)
from app.permissions import can_approve, managed_departments
from app.security import digest


def plan(db, employee, payload):
    if not employee.department:
        raise HTTPException(400, "Tu usuario no tiene un departamento asignado")
    if employee.employed_from and payload.date_from < employee.employed_from:
        raise HTTPException(400, "La solicitud comienza antes de la incorporación")
    if employee.employed_to and payload.date_to > employee.employed_to:
        raise HTTPException(400, "La solicitud termina después de la baja del empleado")
    holidays = set(
        db.scalars(
            select(Holiday.date).where(
                Holiday.calendar_id == employee.calendar_id,
                Holiday.date >= payload.date_from,
                Holiday.date <= payload.date_to,
            )
        )
    )
    try:
        return allocate_days(
            payload.date_from,
            payload.date_to,
            payload.half_start,
            payload.half_end,
            holidays,
            employee.work_hours,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


def find_overlap(db, user_id, allocations, exclude_id=None):
    query = (
        select(LeaveRequest.id)
        .join(RequestDay)
        .where(
            LeaveRequest.user_id == user_id,
            LeaveRequest.status.in_(["pending", "approved"]),
            RequestDay.date.in_([row.date for row in allocations]),
        )
    )
    if exclude_id:
        query = query.where(LeaveRequest.id != exclude_id)
    return db.scalar(query.limit(1))


def staffing_warnings(db, employee, allocations, exclude_id=None):
    department = db.get(Department, employee.department)
    if not department:
        return []
    colleagues = list(
        db.scalars(
            select(Employee).where(
                Employee.department == employee.department, Employee.active.is_(True)
            )
        )
    )
    warnings = []
    for day in allocations:
        working = [
            u
            for u in colleagues
            if str(day.date.weekday()) in u.work_hours
            and (u.employed_from is None or u.employed_from <= day.date)
            and (u.employed_to is None or u.employed_to >= day.date)
        ]
        holiday_calendars = set(
            db.scalars(select(Holiday.calendar_id).where(Holiday.date == day.date))
        )
        working = [u for u in working if u.calendar_id not in holiday_calendars]
        query = (
            select(LeaveRequest.user_id)
            .join(RequestDay)
            .where(
                LeaveRequest.department == employee.department,
                LeaveRequest.status == "approved",
                RequestDay.date == day.date,
            )
        )
        if exclude_id:
            query = query.where(LeaveRequest.id != exclude_id)
        away = set(db.scalars(query)) | {employee.id}
        present = len([u for u in working if u.id not in away])
        if present < department.minimum_present:
            warnings.append(
                {
                    "date": day.date.isoformat(),
                    "present": present,
                    "minimum": department.minimum_present,
                }
            )
    return warnings


def preview(db, employee, payload):
    allocations = plan(db, employee, payload)
    shortfalls = (
        allowance_shortfalls(db, employee, allocations) if payload.type == "vacaciones" else []
    )
    return {
        "days": float(sum((r.units for r in allocations), Decimal(0))),
        "hours": float(sum((r.hours for r in allocations), Decimal(0))),
        "allocation": [
            {"date": r.date.isoformat(), "days": float(r.units), "hours": float(r.hours)}
            for r in allocations
        ],
        "balances": {
            str(year): balance(db, employee, year)
            for year in sorted({r.date.year for r in allocations})
        },
        "shortfalls": shortfalls,
        "overlap": bool(find_overlap(db, employee.id, allocations)),
        "staffingWarnings": staffing_warnings(db, employee, allocations),
    }


def notify(db, item, event, actor):
    recipients = list(
        db.scalars(
            select(Employee).where(
                Employee.active.is_(True),
                Employee.role == "manager",
                Employee.department == item.department,
            )
        )
    )
    if event != "created":
        worker = db.get(Employee, item.user_id)
        if worker:
            recipients.append(worker)
    seen = set()
    for recipient in recipients:
        if not recipient.email or recipient.id in seen:
            continue
        seen.add(recipient.id)
        queue_mail(
            db,
            f"request:{item.id}:{event}:{recipient.id}",
            recipient.email,
            "Novedad en una solicitud de vacaciones o ausencia",
            {
                "name": recipient.name,
                "worker_name": item.user_name,
                "event": event,
                "date_from": item.date_from.isoformat(),
                "date_to": item.date_to.isoformat(),
                "actor_name": actor.name,
            },
        )


def create_request(db, employee, payload, request_key, request=None):
    configuration = lock_configuration(db)
    employee = db.get(Employee, employee.id, populate_existing=True)
    if not employee.active:
        raise HTTPException(403, "Usuario desactivado")
    payload_hash = digest(json.dumps(payload.model_dump(mode="json"), sort_keys=True))
    previous = db.scalar(
        select(LeaveRequest).where(
            LeaveRequest.user_id == employee.id, LeaveRequest.request_key == request_key
        )
    )
    if previous:
        if previous.payload_hash != payload_hash:
            raise HTTPException(409, "La clave de reintento corresponde a otra solicitud")
        return previous, True
    allocations = plan(db, employee, payload)
    if find_overlap(db, employee.id, allocations):
        raise HTTPException(409, "Ya existe una solicitud pendiente o aprobada en esos días")
    shortfalls = (
        allowance_shortfalls(db, employee, allocations) if payload.type == "vacaciones" else []
    )
    if shortfalls and configuration.over_allowance == "block":
        raise HTTPException(
            409,
            {
                "code": "ALLOWANCE_BLOCKED",
                "message": "Saldo insuficiente",
                "shortfalls": shortfalls,
            },
        )
    if shortfalls and not payload.over_allowance_acknowledged:
        raise HTTPException(
            409,
            {
                "code": "ALLOWANCE_CONFIRMATION_REQUIRED",
                "message": "Confirma que deseas solicitar más días que el saldo disponible",
                "shortfalls": shortfalls,
            },
        )
    if payload.type == "vacaciones":
        for year in {r.date.year for r in allocations}:
            effective_policy(db, employee, year, persist=True)
    item = LeaveRequest(
        id=new_id(),
        user_id=employee.id,
        user_name=employee.name,
        department=employee.department,
        type=payload.type,
        date_from=payload.date_from,
        date_to=payload.date_to,
        half_start=payload.half_start,
        half_end=payload.half_end,
        days=sum((r.units for r in allocations), Decimal(0)),
        note=payload.note,
        status="pending",
        request_key=request_key,
        payload_hash=payload_hash,
        over_allowance_acknowledged=payload.over_allowance_acknowledged,
    )
    db.add(item)
    db.flush()
    db.add_all(
        [
            RequestDay(request_id=item.id, date=r.date, units=r.units, hours=r.hours)
            for r in allocations
        ]
    )
    audit(
        db,
        employee,
        "request.created",
        item.id,
        {
            "status": "pending",
            "over_allowance_acknowledged": payload.over_allowance_acknowledged,
            "shortfall_years": [r["year"] for r in shortfalls],
        },
        request,
    )
    notify(db, item, "created", employee)
    db.commit()
    return item, False


def resolve_request(db, actor, request_id, payload, request=None):
    configuration = lock_configuration(db)
    item = db.scalar(select(LeaveRequest).where(LeaveRequest.id == request_id).with_for_update())
    if not item:
        raise HTTPException(404, "Solicitud no encontrada")
    departments = managed_departments(db, actor)
    if payload.action == "withdraw":
        permitted = actor.id == item.user_id and item.status == "pending"
    else:
        permitted = can_approve(actor, item, departments)
    if not permitted:
        raise HTTPException(403, "No tienes permiso para resolver esta solicitud")
    transitions = {
        "approve": ("pending", "approved"),
        "reject": ("pending", "rejected"),
        "cancel": ("approved", "cancelled"),
        "withdraw": ("pending", "cancelled"),
    }
    original, target = transitions[payload.action]
    if item.status != original:
        raise HTTPException(409, "La solicitud ya ha cambiado de estado")
    if payload.action in {"reject", "cancel"} and not (payload.decision_note or "").strip():
        raise HTTPException(400, "Indica el motivo de la decisión")
    if payload.action == "approve":
        employee = db.get(Employee, item.user_id)
        if not employee.active:
            raise HTTPException(409, "No se puede aprobar una solicitud de un empleado desactivado")
        allocations = [
            DayAllocation(r.date, r.units, r.hours)
            for r in db.scalars(select(RequestDay).where(RequestDay.request_id == item.id))
        ]
        if find_overlap(db, employee.id, allocations, item.id):
            raise HTTPException(409, "La solicitud se solapa con otra ausencia")
        shortfalls = (
            allowance_shortfalls(db, employee, allocations, item.id)
            if item.type == "vacaciones"
            else []
        )
        if shortfalls and configuration.over_allowance == "block":
            raise HTTPException(409, "La política actual no permite aprobar sin saldo suficiente")
        if staffing_warnings(db, employee, allocations, item.id):
            raise HTTPException(
                409, "No se cumple la cobertura mínima configurada para el departamento"
            )
    item.status, item.resolved_at, item.resolved_by = target, now(), actor.name
    item.decision_note = payload.decision_note
    audit(
        db,
        actor,
        "request." + payload.action,
        item.id,
        {"from": original, "to": target, "reason": payload.decision_note or ""},
        request,
    )
    notify(db, item, payload.action, actor)
    db.commit()
    return item
