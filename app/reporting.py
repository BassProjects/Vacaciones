"""Authoritative dashboard aggregates, independent of paginated browser data."""

from datetime import date

from sqlalchemy import func, select

from app.constants import ABSENCE_TYPES
from app.models import Employee, LeaveRequest, RequestDay
from app.permissions import today


def dashboard(db, year, departments, maximum_away_percent):
    active = list(db.scalars(select(Employee).where(Employee.active.is_(True))))
    rows = list(
        db.execute(
            select(
                Employee.id,
                Employee.name,
                Employee.department,
                LeaveRequest.type,
                func.sum(RequestDay.units).label("days"),
            )
            .select_from(Employee)
            .join(LeaveRequest, LeaveRequest.user_id == Employee.id)
            .join(RequestDay, RequestDay.request_id == LeaveRequest.id)
            .where(
                Employee.active.is_(True),
                LeaveRequest.status == "approved",
                RequestDay.date >= date(year, 1, 1),
                RequestDay.date <= date(year, 12, 31),
            )
            .group_by(Employee.id, Employee.name, Employee.department, LeaveRequest.type)
            .order_by(Employee.name)
        )
    )

    def type_counts(department=None):
        result = []
        for absence_type in ABSENCE_TYPES:
            workers = [
                {"userId": row.id, "name": row.name, "days": float(row.days)}
                for row in rows
                if row.type == absence_type["id"]
                and (department is None or row.department == department)
            ]
            result.append({"type": absence_type, "count": len(workers), "workers": workers})
        return result

    by_department = []
    for department in departments:
        by_type = type_counts(department.id)
        by_department.append(
            {
                "dept": {"id": department.id, "name": department.name, "color": department.color},
                "employeeCount": sum(u.department == department.id for u in active),
                "byType": by_type,
                "total": sum(row["count"] for row in by_type),
            }
        )
    away_ids = set(
        db.scalars(
            select(LeaveRequest.user_id)
            .join(RequestDay)
            .where(LeaveRequest.status == "approved", RequestDay.date == today())
        )
    )
    away_count = sum(u.id in away_ids for u in active)
    total = len(active)
    percentage = round(away_count / total * 100) if total else 0
    return {
        "year": year,
        "totalActive": total,
        "byType": type_counts(),
        "byDepartment": by_department,
        "away": {
            "awayCount": away_count,
            "total": total,
            "pct": percentage,
            "overLimit": percentage > maximum_away_percent,
        },
    }
