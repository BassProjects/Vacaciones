from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.calendar_rules import prorated_entitlement
from app.models import Configuration, LeaveRequest, Policy, RequestDay
from app.permissions import today


def effective_policy(db, employee, year, persist=False):
    policy = db.get(Policy, (employee.id, year))
    if policy is None:
        configuration = db.get(Configuration, 1)
        policy = Policy(
            user_id=employee.id,
            year=year,
            entitlement=employee.allowance_override
            if employee.allowance_override is not None
            else configuration.default_allowance,
            adjustment=Decimal(0),
            carryover=Decimal(0),
            prorate=False,
        )
        if persist:
            db.add(policy)
            db.flush()
    return policy


def entitlement_for(employee, policy):
    value = policy.entitlement
    if policy.prorate:
        value = prorated_entitlement(
            value, policy.year, employee.employed_from, employee.employed_to
        )
    return max(Decimal(0), value + policy.adjustment)


def ledger_rows(db, user_id, year, exclude_id=None):
    query = (
        select(RequestDay.date, RequestDay.units, LeaveRequest.status)
        .join(LeaveRequest, RequestDay.request_id == LeaveRequest.id)
        .where(
            LeaveRequest.user_id == user_id,
            LeaveRequest.type == "vacaciones",
            LeaveRequest.status.in_(["pending", "approved"]),
            RequestDay.date >= date(year, 1, 1),
            RequestDay.date <= date(year, 12, 31),
        )
    )
    if exclude_id:
        query = query.where(LeaveRequest.id != exclude_id)
    return list(db.execute(query))


def balance(db, employee, year, as_of=None):
    policy = effective_policy(db, employee, year)
    base = entitlement_for(employee, policy)
    as_of = as_of or min(max(today(), date(year, 1, 1)), date(year, 12, 31))
    expiry = policy.carryover_expiry or date(year, 12, 31)
    rows = ledger_rows(db, employee.id, year)
    consumed = sum((r.units for r in rows if r.status == "approved"), Decimal(0))
    pending = sum((r.units for r in rows if r.status == "pending"), Decimal(0))
    carry_used = min(
        policy.carryover,
        sum((r.units for r in rows if r.status == "approved" and r.date <= expiry), Decimal(0)),
    )
    carry_available = policy.carryover - carry_used if as_of <= expiry else Decimal(0)
    remaining = base - (consumed - carry_used) + carry_available
    return {
        "year": year,
        "allowance": float(base + carry_used + carry_available),
        "entitlement": float(base),
        "consumed": float(consumed),
        "pending": float(pending),
        "remaining": float(max(Decimal(0), remaining)),
        "deficit": float(max(Decimal(0), -remaining)),
        "carryover": float(policy.carryover),
        "carryoverExpired": as_of > expiry,
        "authoritative": True,
    }


def allowance_shortfalls(db, employee, allocations, exclude_id=None):
    result = []
    for year in sorted({r.date.year for r in allocations}):
        policy = effective_policy(db, employee, year)
        rows = ledger_rows(db, employee.id, year, exclude_id)
        candidates = [r for r in allocations if r.date.year == year]
        expiry = policy.carryover_expiry or date(year, 12, 31)
        total = sum((r.units for r in rows), Decimal(0)) + sum(
            (r.units for r in candidates), Decimal(0)
        )
        eligible = sum((r.units for r in rows if r.date <= expiry), Decimal(0)) + sum(
            (r.units for r in candidates if r.date <= expiry), Decimal(0)
        )
        capacity = entitlement_for(employee, policy) + min(policy.carryover, eligible)
        shortage = total - capacity
        if shortage > 0:
            result.append(
                {
                    "year": year,
                    "excess": float(shortage),
                    "allowance": float(capacity),
                    "used": float(total - sum((r.units for r in candidates), Decimal(0))),
                    "days": float(sum((r.units for r in candidates), Decimal(0))),
                }
            )
    return result
