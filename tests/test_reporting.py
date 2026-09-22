from datetime import date

import pytest

from app.models import Employee, LeaveRequest, RequestDay

pytestmark = pytest.mark.postgres


def test_dashboard_uses_daily_ledger_across_years_and_keeps_medical_types_private(
    database, clients
):
    admin, worker = clients("admin"), clients("worker")
    with database.sessions() as db:
        employee = db.get(Employee, "test-worker")
        db.add(
            LeaveRequest(
                id="report-cross-year",
                user_id=employee.id,
                user_name=employee.name,
                department=employee.department,
                type="baja",
                date_from=date(2026, 12, 31),
                date_to=date(2027, 1, 4),
                days=2,
                status="approved",
            )
        )
        db.flush()
        db.add_all(
            [
                RequestDay(request_id="report-cross-year", date=day, units=1, hours=8)
                for day in (date(2026, 12, 31), date(2027, 1, 4))
            ]
        )
        db.commit()
    for year in (2026, 2027):
        result = admin.get(f"/api/bootstrap?year={year}")
        assert result.status_code == 200, result.text
        report = result.json()["adminReport"]
        absence = next(row for row in report["byType"] if row["type"]["id"] == "baja")
        assert absence["count"] == 1 and absence["workers"][0]["days"] == 1
    assert worker.get("/api/bootstrap").json()["adminReport"] is None


def test_default_year_is_resolved_per_request_not_at_server_start(clients, monkeypatch):
    import app.routes.requests as routes

    admin = clients("admin")
    monkeypatch.setattr(routes, "today", lambda: date(2031, 1, 1))
    result = admin.get("/api/bootstrap")
    assert result.status_code == 200, result.text
    assert result.json()["requestsYear"] == 2031
    assert result.json()["adminReport"]["year"] == 2031
