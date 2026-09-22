import io

import pytest
from conftest import send
from openpyxl import Workbook, load_workbook
from sqlalchemy import func, select

from app.config import Settings
from app.file_parsers import parse_calamari, parse_holidays
from app.mailer import DeliveryError, drain, queue_mail
from app.models import ImportBatch, LeaveRequest, Outbox


def workbook_bytes(rows):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Detailed timesheet"
    for row in rows:
        sheet.append(row)
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


def test_document_parsers_support_utf8_and_exact_imported_hours():
    holidays = parse_holidays(
        "Fecha;Nombre\n2026-10-12;Día de prueba\n2026-02-30;Inválido".encode(), "festivos.csv"
    )
    assert holidays["holidays"] == [{"date": "2026-10-12", "name": "Día de prueba"}]
    assert len(holidays["errors"]) == 1
    data = workbook_bytes(
        [
            ["Nombre", "Equipos", "E-mail", "Tipo", "19/10/2026", "20/10/2026", "Suma"],
            ["Prueba", "Marketing", "worker@example.com", "Vacaciones", "3h", "4h", "7h"],
        ]
    )
    periods = parse_calamari(data, "prueba.xlsx")["periods"]
    assert len(periods) == 1
    assert periods[0]["allocation"] == [
        {"date": "2026-10-19", "hours": "3.0000"},
        {"date": "2026-10-20", "hours": "4.0000"},
    ]
    assert periods[0]["days"] == 0.875


@pytest.mark.postgres
def test_holiday_import_is_atomic_owned_and_idempotent(clients, database):
    admin = clients("admin")
    data = "Fecha,Nombre\n2026-10-12,Día sintético\n2026-12-25,Otro festivo".encode()
    uploaded = send(
        admin, "POST", "/api/holidays/import", files={"file": ("festivos.csv", data, "text/csv")}
    )
    assert uploaded.status_code == 200, uploaded.text
    batch_id = uploaded.json()["batchId"]
    assert len(uploaded.json()["holidays"]) == 2
    invalid = send(
        admin, "POST", "/api/holidays/import/confirm", json={"batchId": batch_id, "selected": [100]}
    )
    assert invalid.status_code == 400
    forged = send(
        admin,
        "POST",
        "/api/holidays/import/confirm",
        json={"batchId": batch_id, "selected": [0], "holidays": []},
    )
    assert forged.status_code == 422
    result = send(
        admin,
        "POST",
        "/api/holidays/import/confirm",
        json={"batchId": batch_id, "selected": [0, 1]},
    )
    assert result.status_code == 200 and result.json()["imported"] == 2
    repeated = send(
        admin,
        "POST",
        "/api/holidays/import/confirm",
        json={"batchId": batch_id, "selected": [0, 1]},
    )
    assert repeated.status_code == 200 and repeated.json()["duplicate"]
    assert (
        send(
            clients("worker"),
            "POST",
            "/api/holidays/import",
            files={"file": ("f.csv", data, "text/csv")},
        ).status_code
        == 403
    )


@pytest.mark.postgres
def test_calamari_import_roundtrip_preserves_fractions_and_detects_duplicates(clients, database):
    admin = clients("admin")
    data = workbook_bytes(
        [
            ["Nombre", "Equipos", "E-mail", "Tipo", "19/10/2026", "20/10/2026", "Suma"],
            ["Prueba", "Marketing", "worker@example.com", "Vacaciones", "3h", "4h", "7h"],
        ]
    )
    upload = send(
        admin,
        "POST",
        "/api/reports/calamari-import",
        files={
            "file": (
                "historico.xlsx",
                data,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert upload.status_code == 200, upload.text
    payload = {"batchId": upload.json()["batchId"], "selected": [0]}
    confirmed = send(admin, "POST", "/api/reports/calamari-import/confirm", json=payload)
    assert confirmed.status_code == 200 and confirmed.json()["imported"] == 1, confirmed.text
    assert send(admin, "POST", "/api/reports/calamari-import/confirm", json=payload).json()[
        "duplicate"
    ]
    exported = admin.get("/api/reports/timesheet-export?ym=2026-10&userId=test-worker")
    assert exported.status_code == 200
    periods = parse_calamari(exported.content, "export.xlsx")["periods"]
    assert periods[0]["days"] == 0.875
    assert periods[0]["allocation"][0]["hours"] == "3.0000"
    assert admin.get("/api/reports/timesheet-export?ym=2026-13").status_code == 400
    with database.sessions() as db:
        assert db.scalar(select(func.count()).select_from(LeaveRequest)) == 1


@pytest.mark.postgres
def test_bad_calamari_batch_rolls_back_all_rows(clients, database):
    admin = clients("admin")
    data = workbook_bytes(
        [
            ["Nombre", "Equipos", "E-mail", "Tipo", "19/10/2026", "Suma"],
            ["Prueba", "Marketing", "worker@example.com", "Vacaciones", "8h", "8h"],
            ["Desconocido", "Marketing", "missing@example.com", "Vacaciones", "8h", "8h"],
        ]
    )
    upload = send(
        admin,
        "POST",
        "/api/reports/calamari-import",
        files={"file": ("historico.xlsx", data, "application/octet-stream")},
    )
    assert upload.status_code == 200, upload.text
    confirmed = send(
        admin,
        "POST",
        "/api/reports/calamari-import/confirm",
        json={"batchId": upload.json()["batchId"], "selected": [0, 1]},
    )
    assert confirmed.status_code == 409
    with database.sessions() as db:
        assert db.scalar(select(func.count()).select_from(LeaveRequest)) == 0
        assert not db.get(ImportBatch, upload.json()["batchId"]).confirmed


@pytest.mark.postgres
def test_export_does_not_turn_employee_text_into_formulas(clients, database):
    from app.models import Employee

    admin = clients("admin")
    with database.sessions() as db:
        db.get(Employee, "test-worker").name = '=HYPERLINK("https://example.invalid","name")'
        db.commit()
    response = admin.get("/api/reports/timesheet-export?ym=2026-10&userId=test-worker")
    workbook = load_workbook(io.BytesIO(response.content), read_only=True, data_only=False)
    assert workbook.active["A2"].data_type == "s"
    assert workbook.active["A2"].value.startswith("=HYPERLINK")
    workbook.close()


def smtp_settings():
    return Settings(
        database_url="",
        environment="test",
        app_url="http://testserver",
        mail_enabled=True,
        smtp_user="notifications@example.com",
        smtp_password="synthetic-password-for-tests",
    )


@pytest.mark.postgres
def test_outbox_delivery_is_bounded_and_does_not_retry_uncertain_messages(database, employees):
    class FakeTransport:
        def __init__(self):
            self.calls = 0

        def send(self, *args):
            self.calls += 1
            raise DeliveryError("uncertain", "SMTP_DELIVERY_UNCERTAIN")

        def close(self):
            pass

    with database.sessions() as db:
        queue_mail(
            db,
            "synthetic-event",
            "worker@example.com",
            "Aviso",
            {
                "name": "Prueba",
                "worker_name": "Prueba",
                "event": "created",
                "date_from": "2026-10-19",
                "date_to": "2026-10-20",
            },
        )
        db.commit()
    fake = FakeTransport()
    result = drain(database, smtp_settings(), transport=fake)
    assert result["uncertain"] == 1 and fake.calls == 1
    result = drain(database, smtp_settings(), transport=fake)
    assert result["uncertain"] == 0 and fake.calls == 1
    with database.sessions() as db:
        item = db.scalar(select(Outbox))
        assert item.status == "uncertain" and item.attempts == 1
