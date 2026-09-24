from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select

from app.db import audit, get_db, lock_configuration
from app.models import (
    AuditEvent,
    Calendar,
    Configuration,
    Delegation,
    Department,
    Employee,
    Outbox,
    Policy,
    now,
)
from app.schemas import (
    CalendarCreate,
    ConfigurationUpdate,
    DelegationCreate,
    DepartmentCreate,
    OutboxRetry,
    PolicyUpdate,
)
from app.security import administrator

router = APIRouter(prefix="/api/admin", tags=["Administración y auditoría"])


def policy_json(p):
    return {
        "userId": p.user_id,
        "year": p.year,
        "entitlement": float(p.entitlement),
        "adjustment": float(p.adjustment),
        "carryover": float(p.carryover),
        "carryoverExpiry": p.carryover_expiry.isoformat() if p.carryover_expiry else None,
        "prorate": p.prorate,
    }


@router.get("/configuration")
def configuration(request: Request, me=Depends(administrator), db=Depends(get_db)):
    config = db.get(Configuration, 1)
    settings = request.app.state.settings
    return {
        "defaultAllowance": float(config.default_allowance),
        "overAllowance": config.over_allowance,
        "maxAwayPercent": config.max_away_percent,
        "mailEnabled": settings.mail_enabled,
        "mailConfigured": settings.mail_configured,
        "departments": [
            {"id": d.id, "name": d.name, "color": d.color, "minimumPresent": d.minimum_present}
            for d in db.scalars(select(Department).order_by(Department.name))
        ],
        "calendars": [
            {"id": c.id, "name": c.name}
            for c in db.scalars(select(Calendar).order_by(Calendar.name))
        ],
    }


@router.put("/configuration")
def set_configuration(
    payload: ConfigurationUpdate, request: Request, me=Depends(administrator), db=Depends(get_db)
):
    config = lock_configuration(db)
    for key, value in payload.model_dump().items():
        setattr(config, key, value)
    audit(db, me, "configuration.updated", "1", payload.model_dump(mode="json"), request)
    db.commit()
    return {
        "ok": True,
        "message": "Las concesiones anuales ya fijadas no se modifican retroactivamente",
    }


@router.put("/departments")
def set_department(
    payload: DepartmentCreate, request: Request, me=Depends(administrator), db=Depends(get_db)
):
    lock_configuration(db)
    item = db.get(Department, payload.id)
    if item is None:
        item = Department(id=payload.id)
        db.add(item)
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    audit(db, me, "department.updated", item.id, payload.model_dump(mode="json"), request)
    db.commit()
    return {"ok": True}


@router.put("/calendars")
def set_calendar(
    payload: CalendarCreate, request: Request, me=Depends(administrator), db=Depends(get_db)
):
    lock_configuration(db)
    item = db.get(Calendar, payload.id)
    if item is None:
        item = Calendar(id=payload.id)
        db.add(item)
    item.name = payload.name
    audit(db, me, "calendar.updated", item.id, {"name": item.name}, request)
    db.commit()
    return {"ok": True}


@router.get("/policies")
def policies(year: int = Query(ge=1900, le=2200), me=Depends(administrator), db=Depends(get_db)):
    return {
        "policies": [policy_json(p) for p in db.scalars(select(Policy).where(Policy.year == year))]
    }


@router.put("/policies/{user_id}/{year}")
def set_policy(
    user_id: str,
    year: int,
    payload: PolicyUpdate,
    request: Request,
    me=Depends(administrator),
    db=Depends(get_db),
):
    lock_configuration(db)
    employee = db.get(Employee, user_id)
    if not 1900 <= year <= 2200 or not employee or employee.deleted_at is not None:
        raise HTTPException(400, "Empleado o año no válido")
    if payload.carryover_expiry and payload.carryover_expiry.year != year:
        raise HTTPException(400, "La caducidad debe pertenecer al mismo ejercicio")
    policy = db.get(Policy, (user_id, year))
    if policy is None:
        policy = Policy(user_id=user_id, year=year)
        db.add(policy)
    for key, value in payload.model_dump().items():
        setattr(policy, key, value)
    audit(
        db,
        me,
        "policy.updated",
        user_id,
        {"year": year, **payload.model_dump(mode="json")},
        request,
    )
    db.commit()
    return {"ok": True}


@router.get("/delegations")
def delegations(me=Depends(administrator), db=Depends(get_db)):
    return {
        "delegations": [
            {
                "id": d.id,
                "managerId": d.manager_id,
                "delegateId": d.delegate_id,
                "dateFrom": d.date_from.isoformat(),
                "dateTo": d.date_to.isoformat(),
            }
            for d in db.scalars(select(Delegation).order_by(Delegation.date_from.desc()))
        ]
    }


@router.post("/delegations")
def create_delegation(
    payload: DelegationCreate, request: Request, me=Depends(administrator), db=Depends(get_db)
):
    lock_configuration(db)
    manager, delegate = db.get(Employee, payload.manager_id), db.get(Employee, payload.delegate_id)
    if (
        not manager
        or not delegate
        or not manager.active
        or not delegate.active
        or manager.role != "manager"
    ):
        raise HTTPException(400, "La delegación requiere un responsable y un sustituto activos")
    item = Delegation(**payload.model_dump())
    db.add(item)
    db.flush()
    audit(db, me, "delegation.created", item.id, payload.model_dump(mode="json"), request)
    db.commit()
    return {"id": item.id}


@router.delete("/delegations/{delegation_id}")
def revoke_delegation(
    delegation_id: str, request: Request, me=Depends(administrator), db=Depends(get_db)
):
    lock_configuration(db)
    item = db.get(Delegation, delegation_id)
    if not item:
        raise HTTPException(404, "Delegación no encontrada")
    audit(
        db,
        me,
        "delegation.revoked",
        item.id,
        {"manager_id": item.manager_id, "delegate_id": item.delegate_id},
        request,
    )
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.get("/audit")
def audit_events(
    page: int = Query(default=1, ge=1),
    entity_id: str | None = None,
    me=Depends(administrator),
    db=Depends(get_db),
):
    query = select(AuditEvent)
    if entity_id:
        query = query.where(AuditEvent.entity_id == entity_id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(
        query.order_by(AuditEvent.created_at.desc(), AuditEvent.id)
        .offset((page - 1) * 100)
        .limit(100)
    )
    return {
        "events": [
            {
                "id": r.id,
                "actorId": r.actor_id,
                "action": r.action,
                "entityId": r.entity_id,
                "details": r.details,
                "requestId": r.request_id,
                "at": r.created_at.isoformat(),
            }
            for r in rows
        ],
        "page": page,
        "total": total,
    }


@router.get("/outbox")
def outbox(page: int = Query(default=1, ge=1), me=Depends(administrator), db=Depends(get_db)):
    rows = db.scalars(
        select(Outbox).order_by(Outbox.created_at.desc()).offset((page - 1) * 100).limit(100)
    )
    return {
        "messages": [
            {
                "id": r.id,
                "recipient": r.recipient,
                "subject": r.subject,
                "status": r.status,
                "attempts": r.attempts,
                "lastError": r.last_error,
                "createdAt": r.created_at.isoformat(),
            }
            for r in rows
        ],
        "page": page,
    }


@router.post("/outbox/{message_id}/retry")
def retry_mail(
    message_id: str,
    payload: OutboxRetry,
    request: Request,
    me=Depends(administrator),
    db=Depends(get_db),
):
    item = db.scalar(select(Outbox).where(Outbox.id == message_id).with_for_update())
    if not item or item.status not in {"failed", "uncertain"}:
        raise HTTPException(409, "Este mensaje no admite un reintento manual")
    if item.status == "uncertain" and not payload.acknowledge_possible_duplicate:
        raise HTTPException(
            409, "La entrega anterior es incierta. Confirma el riesgo de envío duplicado"
        )
    item.status, item.attempts, item.available_at = "pending", 0, now()
    audit(
        db,
        me,
        "mail.retry_requested",
        item.id,
        {"possible_duplicate_acknowledged": payload.acknowledge_possible_duplicate},
        request,
    )
    db.commit()
    return {"ok": True}


@router.post("/reset")
def removed_reset(me=Depends(administrator)):
    raise HTTPException(
        410, "El borrado masivo se ha retirado. La desactivación conserva el historial"
    )
