import hashlib
import io
import json
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from openpyxl import Workbook
from sqlalchemy import func, select

from app.balances import effective_policy
from app.db import audit, get_db, lock_configuration
from app.models import (
    Calendar,
    Department,
    Employee,
    Holiday,
    ImportBatch,
    LeaveRequest,
    RequestDay,
    new_id,
    now,
)
from app.schemas import HolidayCreate, ImportConfirmation, real_date
from app.security import administrator, digest
from app.uploads import bounded_file, parse_document

router = APIRouter(tags=["Importaciones y exportaciones"])


def new_batch(db, me, kind, fingerprint, parsed):
    lock_configuration(db)
    existing = db.scalar(
        select(ImportBatch).where(ImportBatch.kind == kind, ImportBatch.fingerprint == fingerprint)
    )
    if existing:
        if existing.user_id != me.id:
            raise HTTPException(409, "Este archivo ya tiene un lote asociado a otro administrador")
        if existing.confirmed:
            raise HTTPException(409, "Este archivo ya fue confirmado; no se importará otra vez")
        existing.expires_at = now() + timedelta(hours=2)
        existing.payload = parsed
        db.commit()
        return existing
    item = ImportBatch(
        id=new_id(),
        user_id=me.id,
        kind=kind,
        fingerprint=fingerprint,
        payload=parsed,
        expires_at=now() + timedelta(hours=2),
    )
    db.add(item)
    db.commit()
    return item


def confirmation_batch(db, me, payload, kind):
    lock_configuration(db)
    batch = db.scalar(
        select(ImportBatch).where(ImportBatch.id == payload.batch_id).with_for_update()
    )
    if not batch or batch.kind != kind or batch.user_id != me.id:
        raise HTTPException(404, "Lote no encontrado")
    if batch.confirmed:
        return batch, None
    if batch.expires_at <= now():
        raise HTTPException(409, "La previsualización ha caducado; vuelve a subir el archivo")
    key = "holidays" if kind == "holidays" else "periods"
    rows = batch.payload[key]
    if len(set(payload.selected)) != len(payload.selected) or any(
        i >= len(rows) for i in payload.selected
    ):
        raise HTTPException(400, "Selección no válida")
    return batch, [rows[i] for i in sorted(payload.selected)]


@router.post("/api/holidays")
def add_holiday(
    payload: HolidayCreate, request: Request, me=Depends(administrator), db=Depends(get_db)
):
    lock_configuration(db)
    if not db.get(Calendar, payload.calendar_id):
        raise HTTPException(400, "Calendario no válido")
    item = db.get(Holiday, (payload.calendar_id, payload.date))
    if item is None:
        db.add(
            Holiday(calendar_id=payload.calendar_id, date=payload.date, name=payload.name.strip())
        )
    else:
        item.name = payload.name.strip()
    audit(
        db,
        me,
        "holiday.updated",
        payload.date.isoformat(),
        {"calendar_id": payload.calendar_id},
        request,
    )
    db.commit()
    return {"ok": True, "historicalAllocationsUnchanged": True}


@router.get("/api/holidays")
def list_holidays(calendar_id: str = "default", me=Depends(administrator), db=Depends(get_db)):
    return {
        "holidays": [
            {"date": h.date.isoformat(), "name": h.name, "calendarId": h.calendar_id}
            for h in db.scalars(
                select(Holiday).where(Holiday.calendar_id == calendar_id).order_by(Holiday.date)
            )
        ]
    }


@router.delete("/api/holidays/{day}")
def delete_holiday(
    day: str,
    request: Request,
    calendar_id: str = "default",
    me=Depends(administrator),
    db=Depends(get_db),
):
    try:
        actual_date = real_date(day)
    except ValueError as exc:
        raise HTTPException(400, "Fecha no válida") from exc
    lock_configuration(db)
    item = db.get(Holiday, (calendar_id, actual_date))
    if item:
        db.delete(item)
        audit(db, me, "holiday.deleted", day, {"calendar_id": calendar_id}, request)
        db.commit()
    return {"ok": True, "historicalAllocationsUnchanged": True}


@router.post("/api/holidays/import")
def preview_holidays(
    request: Request,
    file: UploadFile = File(),
    calendar_id: str = Form("default"),
    me=Depends(administrator),
    db=Depends(get_db),
):
    if not db.get(Calendar, calendar_id):
        raise HTTPException(400, "Calendario no válido")
    data = bounded_file(file)
    result = parse_document("holidays", data, file.filename or "")
    result["calendarId"] = calendar_id
    fingerprint = hashlib.sha256(calendar_id.encode() + b"\0" + data).hexdigest()
    batch = new_batch(db, me, "holidays", fingerprint, result)
    return {**result, "batchId": batch.id, "expiresAt": batch.expires_at.isoformat()}


@router.post("/api/holidays/import/confirm")
def confirm_holidays(
    payload: ImportConfirmation, request: Request, me=Depends(administrator), db=Depends(get_db)
):
    batch, selected = confirmation_batch(db, me, payload, "holidays")
    if selected is None:
        return {"ok": True, "imported": 0, "duplicate": True}
    calendar_id = batch.payload["calendarId"]
    for row in selected:
        actual_date = date.fromisoformat(row["date"])
        item = db.get(Holiday, (calendar_id, actual_date))
        if item:
            item.name = row["name"]
        else:
            db.add(Holiday(calendar_id=calendar_id, date=actual_date, name=row["name"]))
    batch.confirmed = True
    audit(
        db,
        me,
        "import.holidays_confirmed",
        batch.id,
        {"count": len(selected), "calendar_id": calendar_id},
        request,
    )
    db.commit()
    return {"ok": True, "imported": len(selected)}


@router.post("/api/reports/calamari-import")
def preview_calamari(
    request: Request, file: UploadFile = File(), me=Depends(administrator), db=Depends(get_db)
):
    data = bounded_file(file)
    result = parse_document("calamari", data, file.filename or "")
    users = {u.email.lower(): u for u in db.scalars(select(Employee)) if u.email}
    for row in result["periods"]:
        employee = users.get(row["email"])
        row["matchedUserId"] = employee.id if employee else None
        row["matchedUserName"] = employee.name if employee else None
        row["department"] = employee.department if employee else None
        if employee:
            total_units = Decimal(0)
            for day in row["allocation"]:
                actual_date = date.fromisoformat(day["date"])
                scheduled = Decimal(employee.work_hours.get(str(actual_date.weekday()), "0"))
                # Historical fractions are converted against the employee's explicit work schedule.
                day["units"] = (
                    str((Decimal(day["hours"]) / scheduled).quantize(Decimal("0.0001")))
                    if scheduled > 0
                    else None
                )
                if day["units"] is not None:
                    total_units += Decimal(day["units"])
            row["days"] = float(total_units)
    batch = new_batch(db, me, "calamari", hashlib.sha256(data).hexdigest(), result)
    return {**result, "batchId": batch.id, "expiresAt": batch.expires_at.isoformat()}


@router.post("/api/reports/calamari-import/confirm")
def confirm_calamari(
    payload: ImportConfirmation, request: Request, me=Depends(administrator), db=Depends(get_db)
):
    batch, selected = confirmation_batch(db, me, payload, "calamari")
    if selected is None:
        return {"ok": True, "imported": 0, "duplicate": True}
    imported, skipped = 0, 0
    for row in selected:
        employee = db.get(Employee, row["matchedUserId"]) if row["matchedUserId"] else None
        if not employee or employee.deleted_at is not None or not employee.department:
            raise HTTPException(
                409, "Todas las filas elegidas deben corresponder a un empleado con departamento"
            )
        source_key = digest(
            json.dumps(
                {"user": employee.id, "type": row["type"], "allocation": row["allocation"]},
                sort_keys=True,
            )
        )
        if db.scalar(select(LeaveRequest.id).where(LeaveRequest.source_key == source_key)):
            skipped += 1
            continue
        total = Decimal(0)
        for day in row["allocation"]:
            actual_date = date.fromisoformat(day["date"])
            scheduled = Decimal(employee.work_hours.get(str(actual_date.weekday()), "0"))
            units = Decimal(day["units"]) if day["units"] is not None else Decimal(0)
            if units <= 0 or scheduled <= 0 or Decimal(day["hours"]) > scheduled:
                raise HTTPException(
                    409,
                    "Hay horas importadas incompatibles con la jornada; "
                    "revisa el calendario del empleado",
                )
            current_units = (Decimal(day["hours"]) / scheduled).quantize(Decimal("0.0001"))
            if current_units != units:
                raise HTTPException(
                    409, "La jornada cambió desde la previsualización; vuelve a subir el archivo"
                )
            occupied = db.scalar(
                select(func.coalesce(func.sum(RequestDay.units), 0))
                .join(LeaveRequest)
                .where(
                    LeaveRequest.user_id == employee.id,
                    LeaveRequest.status.in_(["pending", "approved"]),
                    RequestDay.date == actual_date,
                )
            )
            if occupied + units > 1:
                raise HTTPException(
                    409, "La importación duplicaría o solaparía horas ya registradas"
                )
            total += units
        item = LeaveRequest(
            id=new_id(),
            user_id=employee.id,
            user_name=employee.name,
            department=employee.department,
            type=row["type"],
            date_from=date.fromisoformat(row["dateFrom"]),
            date_to=date.fromisoformat(row["dateTo"]),
            half_start=row["halfStart"],
            half_end=row["halfEnd"],
            days=total,
            status="approved",
            source="calamari",
            source_key=source_key,
            note="Importado desde histórico de Calamari",
            resolved_at=now(),
            resolved_by=me.name,
            decision_note="Registro histórico importado",
        )
        db.add(item)
        db.flush()
        for day in row["allocation"]:
            actual_date = date.fromisoformat(day["date"])
            db.add(
                RequestDay(
                    request_id=item.id,
                    date=actual_date,
                    units=Decimal(day["units"]),
                    hours=Decimal(day["hours"]),
                )
            )
            if row["type"] == "vacaciones":
                effective_policy(db, employee, actual_date.year, persist=True)
        audit(db, me, "request.imported", item.id, {"batch_id": batch.id}, request)
        imported += 1
        db.flush()
    batch.confirmed = True
    audit(
        db,
        me,
        "import.calamari_confirmed",
        batch.id,
        {"imported": imported, "skipped": skipped},
        request,
    )
    db.commit()
    return {"ok": True, "imported": imported, "skipped": skipped}


def export_workbook(db, year, month, user_id="all"):
    query = select(Employee).order_by(Employee.name)
    if user_id != "all":
        query = query.where(Employee.id == user_id)
    users = list(db.scalars(query))
    if not users or len(users) > 1000:
        raise HTTPException(400, "Selecciona un empleado o un grupo de hasta 1000 empleados")
    first, last = date(year, month, 1), date(year, month, monthrange(year, month)[1])
    dates = [first + timedelta(days=i) for i in range((last - first).days + 1)]
    departments = {d.id: d.name for d in db.scalars(select(Department))}
    holiday_rows = {
        (h.calendar_id, h.date)
        for h in db.scalars(select(Holiday).where(Holiday.date >= first, Holiday.date <= last))
    }
    hours = {}
    for user, kind, day, amount in db.execute(
        select(LeaveRequest.user_id, LeaveRequest.type, RequestDay.date, RequestDay.hours)
        .join(RequestDay)
        .where(LeaveRequest.status == "approved", RequestDay.date >= first, RequestDay.date <= last)
    ):
        key = (user, kind, day)
        hours[key] = hours.get(key, Decimal(0)) + amount
    workbook = Workbook(write_only=True)
    sheet = workbook.create_sheet("Detailed timesheet")
    from openpyxl.cell import WriteOnlyCell

    def append(values):
        cells = []
        for value in values:
            cell = WriteOnlyCell(sheet, value=value)
            if isinstance(value, str):
                cell.data_type = "s"  # Employee-supplied strings are never spreadsheet formulas.
            cells.append(cell)
        sheet.append(cells)

    append(
        ["Nombre", "Equipos", "E-mail", "Tipo", *[d.strftime("%d/%m/%Y") for d in dates], "Suma"]
    )
    kinds = [
        ("planned", "Planned work time"),
        ("holidays", "Holidays"),
        ("vacaciones", "Vacaciones"),
        ("ausencia", "Ausencia temporal"),
        ("baja", "Baja por enfermedad"),
        ("permiso", "Días de permiso"),
        ("total", "All absences"),
    ]
    for employee in users:
        for kind, label in kinds:
            amounts = []
            for day in dates:
                planned = Decimal(employee.work_hours.get(str(day.weekday()), "0"))
                if (employee.employed_from and day < employee.employed_from) or (
                    employee.employed_to and day > employee.employed_to
                ):
                    planned = Decimal(0)
                if kind == "planned":
                    amount = planned
                elif kind == "holidays":
                    amount = planned if (employee.calendar_id, day) in holiday_rows else Decimal(0)
                elif kind == "total":
                    amount = sum(
                        (
                            hours.get((employee.id, k, day), Decimal(0))
                            for k in ("vacaciones", "ausencia", "baja", "permiso")
                        ),
                        Decimal(0),
                    )
                else:
                    amount = hours.get((employee.id, kind, day), Decimal(0))
                amounts.append(amount)
            append(
                [
                    employee.name,
                    departments.get(employee.department, ""),
                    employee.email or "",
                    label,
                    *[f"{float(a):g}h" for a in amounts],
                    f"{float(sum(amounts)):g}h",
                ]
            )
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


@router.get("/api/reports/timesheet-export")
def timesheet_export(
    request: Request,
    ym: str = Query(pattern=r"^\d{4}-\d{2}$"),
    userId: str = "all",
    me=Depends(administrator),
    db=Depends(get_db),
):
    year, month = map(int, ym.split("-"))
    if not 1900 <= year <= 2200 or not 1 <= month <= 12:
        raise HTTPException(400, "Mes no válido")
    content = export_workbook(db, year, month, userId)
    audit(db, me, "report.exported", userId, {"month": ym}, request)
    db.commit()
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="historico_{ym}.xlsx"',
            "Cache-Control": "no-store",
        },
    )
