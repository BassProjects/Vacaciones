import io
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from decimal import Decimal

import pytest
from conftest import TEST_PASSWORD, send
from PIL import Image
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError

from app.cli import migrate
from app.models import (
    AuditEvent,
    Configuration,
    Employee,
    Holiday,
    LeaveRequest,
    Policy,
    RequestDay,
)
from app.permissions import today

pytestmark = pytest.mark.postgres


def test_schema_is_versioned_idempotent_and_has_no_default_admin(database):
    migrate(database)
    with database.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Employee)) == 0
        assert db.get(Configuration, 1).default_allowance == Decimal("22.5")
        assert db.scalar(select(func.count()).select_from(Holiday)) == 0
    assert not database.ready()


def test_audit_cannot_be_changed_or_deleted(database, employees):
    with database.sessions() as db:
        db.add(AuditEvent(id="immutable-test", action="test.created", entity_id="test", details={}))
        db.commit()
    for statement in [
        "UPDATE audit_events SET action='changed'",
        "DELETE FROM audit_events",
        "TRUNCATE audit_events",
    ]:
        with database.engine.connect() as connection:
            with pytest.raises(DBAPIError):
                connection.execute(text(statement))
            connection.rollback()


def test_complete_request_lifecycle_and_privacy(clients, request_payload):
    worker, manager, outsider, coworker = [
        clients(name) for name in ("worker", "manager", "outsider", "coworker")
    ]
    preview = send(worker, "POST", "/api/requests/preview", json=request_payload)
    assert preview.status_code == 200, preview.text
    assert preview.json()["days"] == 2
    created = send(worker, "POST", "/api/requests", json=request_payload)
    assert created.status_code == 200, created.text
    identifier = created.json()["id"]
    assert (
        send(worker, "PATCH", f"/api/requests/{identifier}", json={"action": "approve"}).status_code
        == 403
    )
    assert (
        send(
            outsider, "PATCH", f"/api/requests/{identifier}", json={"action": "approve"}
        ).status_code
        == 403
    )
    approved = send(
        manager,
        "PATCH",
        f"/api/requests/{identifier}",
        json={"action": "approve", "decisionNote": "Decisión privada"},
    )
    assert approved.status_code == 200, approved.text
    public = next(
        r for r in coworker.get("/api/bootstrap").json()["requests"] if r["id"] == identifier
    )
    assert public["type"] == "ausencia" and not public["private"]
    assert not {"note", "decisionNote", "resolvedBy", "requestedAt", "source"} & public.keys()
    assert coworker.get(f"/api/requests/{identifier}").status_code == 404
    assert "Nota privada sintética" not in coworker.get("/api/bootstrap").text
    assert (
        send(
            manager, "PATCH", f"/api/requests/{identifier}", json={"action": "approve"}
        ).status_code
        == 409
    )
    assert (
        send(manager, "PATCH", f"/api/requests/{identifier}", json={"action": "cancel"}).status_code
        == 400
    )
    cancelled = send(
        manager,
        "PATCH",
        f"/api/requests/{identifier}",
        json={"action": "cancel", "decisionNote": "Cambio acordado"},
    )
    assert cancelled.status_code == 200
    history = worker.get(f"/api/requests/{identifier}").json()["history"]
    assert [e["action"] for e in history] == [
        "request.created",
        "request.approve",
        "request.cancel",
    ]
    balance = worker.get("/api/balances/test-worker/2026").json()
    assert balance["consumed"] == 0 and balance["remaining"] == 22.5


def test_request_idempotency_overlap_and_invalid_values(clients, request_payload):
    worker = clients("worker")
    key = "test-idempotency-unique-0001"
    first = send(
        worker, "POST", "/api/requests", json=request_payload, headers={"Idempotency-Key": key}
    )
    again = send(
        worker, "POST", "/api/requests", json=request_payload, headers={"Idempotency-Key": key}
    )
    assert first.status_code == again.status_code == 200
    assert first.json()["id"] == again.json()["id"] and again.json()["duplicate"]
    changed = {**request_payload, "note": "Contenido distinto"}
    assert (
        send(
            worker, "POST", "/api/requests", json=changed, headers={"Idempotency-Key": key}
        ).status_code
        == 409
    )
    assert send(worker, "POST", "/api/requests", json=request_payload).status_code == 409
    assert (
        send(
            worker, "POST", "/api/requests", json={**request_payload, "dateFrom": "2026-02-30"}
        ).status_code
        == 422
    )
    assert (
        send(
            worker, "POST", "/api/requests", json={**request_payload, "halfStart": "false"}
        ).status_code
        == 422
    )
    assert (
        send(
            worker, "POST", "/api/requests", json=request_payload, headers={"Idempotency-Key": ""}
        ).status_code
        == 400
    )


def test_concurrent_duplicate_requests_leave_one_record(clients, request_payload, database):
    workers = [clients("worker"), clients("worker")]
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(
            executor.map(lambda c: send(c, "POST", "/api/requests", json=request_payload), workers)
        )
    assert sorted(r.status_code for r in results) == [200, 409]
    with database.sessions() as db:
        assert db.scalar(select(func.count()).select_from(LeaveRequest)) == 1


def test_allowance_is_enforced_on_server_with_acknowledgment(clients, request_payload, database):
    worker, admin = clients("worker"), clients("admin")
    response = send(
        admin,
        "PUT",
        "/api/admin/policies/test-worker/2026",
        json={"entitlement": 1, "carryover": 0, "adjustment": 0, "prorate": False},
    )
    assert response.status_code == 200, response.text
    rejected = send(worker, "POST", "/api/requests", json=request_payload)
    assert (
        rejected.status_code == 409 and rejected.json()["code"] == "ALLOWANCE_CONFIRMATION_REQUIRED"
    )
    with database.sessions() as db:
        db.get(Configuration, 1).over_allowance = "block"
        db.commit()
    assert (
        send(
            worker,
            "POST",
            "/api/requests",
            json={**request_payload, "overAllowanceAcknowledged": True},
        ).status_code
        == 409
    )
    with database.sessions() as db:
        db.get(Configuration, 1).over_allowance = "warn"
        db.commit()
    approved = send(
        worker, "POST", "/api/requests", json={**request_payload, "overAllowanceAcknowledged": True}
    )
    assert approved.status_code == 200


def test_balances_split_years_and_do_not_depend_on_request_page(clients, database):
    worker = clients("worker")
    with database.sessions() as db:
        employee = db.get(Employee, "test-worker")
        for index in range(1001):
            identifier = "historic-" + str(index)
            db.add(
                LeaveRequest(
                    id=identifier,
                    user_id=employee.id,
                    user_name=employee.name,
                    department=employee.department,
                    type="vacaciones",
                    date_from=date(2026, 10, 19),
                    date_to=date(2026, 10, 19),
                    days=Decimal("0.01"),
                    status="approved",
                    source="legacy",
                )
            )
        db.flush()
        db.add_all(
            [
                RequestDay(
                    request_id="historic-" + str(i),
                    date=date(2026, 10, 19),
                    units=Decimal("0.01"),
                    hours=Decimal("0.08"),
                )
                for i in range(1001)
            ]
        )
        db.add(
            LeaveRequest(
                id="cross-year",
                user_id=employee.id,
                user_name=employee.name,
                department=employee.department,
                type="vacaciones",
                date_from=date(2026, 12, 31),
                date_to=date(2027, 1, 4),
                days=2,
                status="approved",
            )
        )
        db.flush()
        db.add_all(
            [
                RequestDay(request_id="cross-year", date=d, units=1, hours=8)
                for d in (date(2026, 12, 31), date(2027, 1, 4))
            ]
        )
        db.commit()
    response = worker.get("/api/bootstrap?year=2026")
    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data["requests"]) == 200
    assert data["balances"]["test-worker"]["2026"]["consumed"] == 11.01
    assert worker.get("/api/balances/test-worker/2027").json()["consumed"] == 1
    listing = worker.get("/api/requests?year=2026&page=6").json()
    assert listing["total"] == 1002 and len(listing["requests"]) == 2 and not listing["hasMore"]


def test_carryover_expiry_and_pending_balance(database, employees):
    from app.balances import balance

    with database.sessions() as db:
        employee = db.get(Employee, "test-worker")
        db.add(
            Policy(
                user_id=employee.id,
                year=2026,
                entitlement=22,
                adjustment=1,
                carryover=5,
                carryover_expiry=date(2026, 3, 31),
                prorate=False,
            )
        )
        db.commit()
        assert balance(db, employee, 2026, date(2026, 3, 1))["remaining"] == 28
        assert balance(db, employee, 2026, date(2026, 4, 1))["remaining"] == 23


def test_csrf_sessions_password_changes_and_rate_limits(clients):
    worker, old_session = clients("worker"), clients("worker")
    assert worker.post("/api/auth/change-password", json={}).status_code == 403
    assert (
        send(
            worker, "POST", "/api/auth/logout", headers={"Origin": "https://attacker.example"}
        ).status_code
        == 403
    )
    response = send(
        worker,
        "POST",
        "/api/auth/change-password",
        json={"currentPassword": TEST_PASSWORD, "newPassword": "New-synthetic-password-2026"},
    )
    assert response.status_code == 200, response.text
    assert old_session.get("/api/auth/me").json()["user"] is None
    anonymous = clients()
    for _ in range(10):
        response = send(
            anonymous,
            "POST",
            "/api/auth/login",
            json={"username": "nonexistent", "password": "wrong"},
        )
        assert response.status_code == 401
    assert (
        send(
            anonymous,
            "POST",
            "/api/auth/login",
            json={"username": "nonexistent", "password": "wrong"},
        ).status_code
        == 429
    )


def test_last_admin_protection_privilege_escalation_and_soft_deactivation(clients, request_payload):
    admin, worker = clients("admin"), clients("worker")
    assert send(admin, "PATCH", "/api/users/test-admin", json={"role": "worker"}).status_code == 409
    assert send(admin, "PATCH", "/api/users/test-admin", json={"active": False}).status_code == 409
    assert (
        send(worker, "PATCH", "/api/users/test-worker", json={"role": "admin"}).status_code == 403
    )
    created = send(worker, "POST", "/api/requests", json=request_payload).json()["id"]
    response = send(admin, "DELETE", "/api/users/test-worker")
    assert response.status_code == 200 and response.json()["historyPreserved"]
    assert worker.get("/api/auth/me").json()["user"] is None
    assert admin.get(f"/api/requests/{created}").status_code == 200
    assert (
        send(admin, "POST", "/api/admin/reset", json={"confirm": "BORRAR TODO"}).status_code == 410
    )


def test_delegation_and_birthday_opt_in(clients, request_payload, database):
    worker, delegate, admin = clients("worker"), clients("delegate"), clients("admin")
    request_id = send(worker, "POST", "/api/requests", json=request_payload).json()["id"]
    assert (
        send(
            delegate, "PATCH", f"/api/requests/{request_id}", json={"action": "approve"}
        ).status_code
        == 403
    )
    result = send(
        admin,
        "POST",
        "/api/admin/delegations",
        json={
            "managerId": "test-manager",
            "delegateId": "test-delegate",
            "dateFrom": (today() - timedelta(days=1)).isoformat(),
            "dateTo": (today() + timedelta(days=1)).isoformat(),
        },
    )
    assert result.status_code == 200, result.text
    assert (
        send(
            delegate, "PATCH", f"/api/requests/{request_id}", json={"action": "approve"}
        ).status_code
        == 200
    )
    assert (
        send(
            worker, "PATCH", "/api/users/test-worker", json={"birthDate": "1990-07-03"}
        ).status_code
        == 200
    )
    assert not clients("coworker").get("/api/bootstrap").json()["birthdays"]
    assert (
        send(worker, "PATCH", "/api/users/test-worker", json={"shareBirthday": True}).status_code
        == 200
    )
    birthday = clients("coworker").get("/api/bootstrap").json()["birthdays"][0]
    assert birthday["day"] == 3 and birthday["month"] == 7 and "year" not in birthday


def test_attachments_are_validated_private_and_audited(clients, request_payload):
    worker, other = clients("worker"), clients("coworker")
    created = send(worker, "POST", "/api/requests", json={**request_payload, "type": "baja"})
    identifier = created.json()["id"]
    output = io.BytesIO()
    Image.new("RGB", (8, 8)).save(output, format="PNG")
    data = output.getvalue()
    bad = send(
        worker,
        "POST",
        f"/api/requests/{identifier}/attachments",
        files={"file": ("bad.png", b"<script>not an image</script>", "image/png")},
    )
    assert bad.status_code == 422
    uploaded = send(
        worker,
        "POST",
        f"/api/requests/{identifier}/attachments",
        files={"file": ("prueba.png", data, "image/png")},
    )
    assert uploaded.status_code == 200, uploaded.text
    attachment_id = uploaded.json()["id"]
    endpoint = f"/api/requests/{identifier}/attachments/{attachment_id}"
    assert other.get(endpoint).status_code == 404
    download = worker.get(endpoint)
    assert download.content == data
    assert download.headers["content-disposition"].startswith("attachment;")
    assert download.headers["cache-control"] == "no-store"
    wrong_mime = send(
        worker,
        "POST",
        f"/api/requests/{identifier}/attachments",
        files={"file": ("fake.pdf", data, "application/pdf")},
    )
    assert wrong_mime.status_code == 415
