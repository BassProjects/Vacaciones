from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.models import Delegation, Employee


def today():
    return datetime.now(ZoneInfo("Europe/Madrid")).date()


def managed_departments(db, me):
    departments = {me.department} if me.role == "manager" and me.department else set()
    delegated = db.scalars(
        select(Employee.department)
        .join(Delegation, Delegation.manager_id == Employee.id)
        .where(
            Delegation.delegate_id == me.id,
            Delegation.date_from <= today(),
            Delegation.date_to >= today(),
            Employee.active.is_(True),
            Employee.role == "manager",
        )
    )
    departments.update(d for d in delegated if d)
    return departments


def can_view_private(me, item, departments):
    return me.role == "admin" or me.id == item.user_id or item.department in departments


def can_approve(me, item, departments):
    return me.id != item.user_id and (me.role == "admin" or item.department in departments)


def user_json(user):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email or "",
        "username": user.username,
        "department": user.department,
        "role": user.role,
        "active": user.active,
        "onboardingPending": user.onboarding_pending,
        "allowanceOverride": float(user.allowance_override)
        if user.allowance_override is not None
        else None,
        "birthDate": user.birth_date.isoformat() if user.birth_date else None,
        "shareBirthday": user.share_birthday,
        "avatarUrl": None,
        "calendarId": user.calendar_id,
        "workHours": user.work_hours,
        "employedFrom": user.employed_from.isoformat() if user.employed_from else None,
        "employedTo": user.employed_to.isoformat() if user.employed_to else None,
        "mustChangePassword": user.must_change_password,
        "createdAt": user.created_at.isoformat(),
    }


def request_json(item, me, departments):
    private = can_view_private(me, item, departments)
    result = {
        "id": item.id,
        "userId": item.user_id,
        "userName": item.user_name,
        "department": item.department,
        "type": item.type if private else "ausencia",
        "dateFrom": item.date_from.isoformat(),
        "dateTo": item.date_to.isoformat(),
        "halfStart": item.half_start,
        "halfEnd": item.half_end,
        "days": float(item.days),
        "status": item.status,
        "private": private,
        "canApprove": can_approve(me, item, departments),
    }
    if private:
        result.update(
            {
                "note": item.note,
                "requestedAt": item.requested_at.isoformat(),
                "resolvedAt": item.resolved_at.isoformat() if item.resolved_at else None,
                "resolvedBy": item.resolved_by,
                "decisionNote": item.decision_note,
                "source": item.source,
            }
        )
    return result
