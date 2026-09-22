"""Controlled, atomic transfer of the legacy schema into an empty Python database.

This module never connects to the source, never overwrites an existing employee set,
and never runs on web startup. Use only with an authorized, verified archive.
"""

import hashlib
import json
import re
import zipfile
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select

from app.balances import effective_policy
from app.calendar_rules import legacy_allocation
from app.db import audit, lock_configuration
from app.models import (
    Attachment,
    AuditEvent,
    Department,
    Employee,
    Holiday,
    LeaveRequest,
    RequestDay,
)
from app.security import verify_password


def safe_id(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", value):
        raise ValueError("Identificador histórico no válido")
    return value


def legacy_date(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Fecha histórica no válida; requiere revisión del origen")
    result = date.fromisoformat(value)
    if not 1900 <= result.year <= 2200:
        raise ValueError("Año histórico fuera del intervalo admitido")
    return result


def instant(value):
    if value is None:
        return None
    result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("El histórico contiene una fecha/hora sin zona")
    return result.astimezone(timezone.utc)


def text(value, maximum, required=False):
    result = str(value or "").strip()
    if len(result) > maximum or required and not result:
        raise ValueError("Texto histórico no válido o demasiado largo")
    return result


def import_archive(db, path, expected_sha256):
    checksum = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            checksum.update(chunk)
    fingerprint = checksum.hexdigest()
    if not re.fullmatch(r"[a-f0-9]{64}", expected_sha256 or "") or fingerprint != expected_sha256:
        raise ValueError("La huella SHA256 del archivo no coincide con la esperada")
    configuration = lock_configuration(db)
    if db.scalar(
        select(AuditEvent.id).where(
            AuditEvent.action == "migration.legacy_complete", AuditEvent.entity_id == fingerprint
        )
    ):
        return {"duplicate": True, "fingerprint": fingerprint}
    if db.scalar(select(func.count()).select_from(Employee)) or db.scalar(
        select(func.count()).select_from(LeaveRequest)
    ):
        raise ValueError(
            "La transferencia inicial requiere un destino sin empleados ni solicitudes"
        )
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        if len(names) != len(set(names)) or len(entries) > 20001:
            raise ValueError("Archivo de transferencia no válido")
        if any(entry.flag_bits & 1 or entry.file_size > 32 * 1024 * 1024 for entry in entries):
            raise ValueError("Archivo de transferencia fuera de los límites admitidos")
        if sum(entry.file_size for entry in entries) > 2 * 1024 * 1024 * 1024:
            raise ValueError("Se necesita un procedimiento segmentado para esta transferencia")
        metadata = json.loads(archive.read("metadata.json"))
        if metadata.get("format") != "electropolis-vacaciones-legacy/1":
            raise ValueError("Formato de transferencia no reconocido")
        tables = metadata["tables"]
        expected_tables = {"users", "requests", "holidays", "request_attachments", "app_config"}
        if set(tables) != expected_tables or any(
            not isinstance(rows, list) for rows in tables.values()
        ):
            raise ValueError("Faltan tablas del origen")
        if len(tables["users"]) > 10000 or len(tables["requests"]) > 100000:
            raise ValueError("Se necesita un procedimiento segmentado para este volumen")
        source_config = tables["app_config"]
        if len(source_config) != 1 or source_config[0]["id"] != 1:
            raise ValueError("La configuración de origen no es válida")
        allowance = Decimal(str(source_config[0]["default_allowance"]))
        if not allowance.is_finite() or not 0 <= allowance <= 366:
            raise ValueError("Concesión anual no válida")
        configuration.default_allowance = allowance
        # Preserve reference identifiers, including departments added after the original UI.
        department_ids = {u.get("department") for u in tables["users"] if u.get("department")}
        department_ids.update(r["department"] for r in tables["requests"])
        for department_id in sorted(department_ids):
            safe_id(department_id)
            if not db.get(Department, department_id):
                db.add(
                    Department(
                        id=department_id, name=department_id, color="#123a5c", minimum_present=0
                    )
                )
        db.flush()
        holidays = set()
        for row in tables["holidays"]:
            day = legacy_date(row["date"])
            if day in holidays:
                raise ValueError("Festivo repetido en el archivo")
            holidays.add(day)
            db.add(Holiday(calendar_id="default", date=day, name=text(row["name"], 200, True)))
        seen_users, seen_emails, seen_usernames = set(), set(), set()
        blocked_default_admins = []
        for row in tables["users"]:
            user_id = safe_id(row["id"])
            email = text(row.get("email"), 254).lower() or None
            username = text(row["username"], 80, True).lower()
            if (
                user_id in seen_users
                or username in seen_usernames
                or email
                and email in seen_emails
            ):
                raise ValueError(
                    "Empleados, usuarios o correos duplicados: requiere conciliación previa"
                )
            if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
                raise ValueError("Correo histórico no válido")
            seen_users.add(user_id)
            seen_usernames.add(username)
            if email:
                seen_emails.add(email)
            if row["role"] not in {"admin", "manager", "worker"}:
                raise ValueError("Rol histórico no válido")
            password_hash, salt = row["password_hash"], row["password_salt"]
            if not re.fullmatch(r"[a-f0-9]{128}", password_hash) or not re.fullmatch(
                r"[a-f0-9]{32}", salt
            ):
                raise ValueError("Formato de contraseña histórica no reconocido")
            override = (
                Decimal(str(row["allowance_override"]))
                if row.get("allowance_override") is not None
                else None
            )
            if override is not None and (not override.is_finite() or not 0 <= override <= 366):
                raise ValueError("Concesión individual histórica no válida")
            # A publicly known legacy bootstrap password must never become an active imported login.
            known_default = row["role"] == "admin" and verify_password(
                "admin2026", password_hash, salt
            )
            if known_default:
                blocked_default_admins.append(user_id)
            employee = Employee(
                id=user_id,
                name=text(row["name"], 160, True),
                email=email,
                username=username,
                password_hash=password_hash,
                password_salt=salt,
                password_scheme="scrypt-node-v1",
                department=row.get("department"),
                role=row["role"],
                allowance_override=override,
                active=bool(row["active"]) and not known_default,
                must_change_password=known_default,
                birth_date=legacy_date(row["birth_date"]) if row.get("birth_date") else None,
                share_birthday=False,
                calendar_id="default",
                created_at=instant(row["created_at"]),
            )
            db.add(employee)
        db.flush()
        inferred = []
        request_ids = set()
        original_total = Decimal(0)
        target_total = Decimal(0)
        for row in tables["requests"]:
            request_id, user_id = safe_id(row["id"]), safe_id(row["user_id"])
            if request_id in request_ids or user_id not in seen_users:
                raise ValueError("Solicitud duplicada o sin empleado")
            request_ids.add(request_id)
            if row["type"] not in {"vacaciones", "ausencia", "baja", "permiso"} or row[
                "status"
            ] not in {"pending", "approved", "rejected", "cancelled"}:
                raise ValueError("Tipo o estado histórico no válido")
            start, end = legacy_date(row["date_from"]), legacy_date(row["date_to"])
            amount = Decimal(str(row["days"]))
            allocations, adjusted = legacy_allocation(
                start, end, amount, bool(row["half_start"]), bool(row["half_end"]), holidays
            )
            if adjusted:
                inferred.append(request_id)
            item = LeaveRequest(
                id=request_id,
                user_id=user_id,
                user_name=text(row["user_name"], 160, True),
                department=row["department"],
                type=row["type"],
                date_from=start,
                date_to=end,
                half_start=bool(row["half_start"]),
                half_end=bool(row["half_end"]),
                days=amount,
                status=row["status"],
                note=row.get("note"),
                requested_at=instant(row["requested_at"]),
                resolved_at=instant(row.get("resolved_at")),
                resolved_by=text(row.get("resolved_by"), 160) or None,
                decision_note=row.get("decision_note"),
                source="legacy",
                source_key=hashlib.sha256(("legacy:" + request_id).encode()).hexdigest(),
            )
            db.add(item)
            db.flush()
            db.add_all(
                [
                    RequestDay(request_id=request_id, date=a.date, units=a.units, hours=a.hours)
                    for a in allocations
                ]
            )
            employee = db.get(Employee, user_id)
            if item.type == "vacaciones":
                for year in {a.date.year for a in allocations}:
                    effective_policy(db, employee, year, persist=True)
            audit(
                db,
                None,
                "migration.legacy_snapshot",
                request_id,
                {
                    "status": item.status,
                    "original_total": str(amount),
                    "inferred_allocation": adjusted,
                    "original_requested_at": item.requested_at.isoformat(),
                    "original_resolved_at": item.resolved_at.isoformat()
                    if item.resolved_at
                    else None,
                    "original_resolved_by": item.resolved_by,
                },
            )
            original_total += amount
            target_total += sum((a.units for a in allocations), Decimal(0))
        attachment_ids, attachment_bytes = set(), 0
        for row in tables["request_attachments"]:
            attachment_id = safe_id(row["id"])
            if attachment_id in attachment_ids or row["request_id"] not in request_ids:
                raise ValueError("Justificante duplicado o sin solicitud")
            attachment_ids.add(attachment_id)
            entry_name = f"attachments/{attachment_id}.bin"
            if row.get("archive_path") != entry_name:
                raise ValueError("Ruta de justificante no válida")
            data = archive.read(entry_name)
            checksum = hashlib.sha256(data).hexdigest()
            if (
                checksum != row["sha256"]
                or len(data) != row["size_bytes"]
                or not 0 < len(data) <= 8 * 1024 * 1024
            ):
                raise ValueError("El contenido de un justificante no coincide con el origen")
            if row["mime_type"] not in {
                "application/pdf",
                "image/png",
                "image/jpeg",
                "image/webp",
                "image/gif",
            }:
                raise ValueError("Tipo de justificante histórico no reconocido")
            filename = text(row["filename"], 200, True)
            if re.search(r"[\x00-\x1f\x7f]", filename):
                raise ValueError("Nombre de justificante histórico no válido")
            db.add(
                Attachment(
                    id=attachment_id,
                    request_id=row["request_id"],
                    filename=filename,
                    mime_type=row["mime_type"],
                    size_bytes=len(data),
                    data=data,
                    sha256=checksum,
                    uploaded_by=text(row["uploaded_by"], 160, True),
                    uploaded_at=instant(row["uploaded_at"]),
                )
            )
            attachment_bytes += len(data)
        db.flush()
        if target_total != original_total:
            raise ValueError(
                "La conciliación de saldos no coincide; no se guardará la transferencia"
            )
        counts = {
            "users": len(seen_users),
            "requests": len(request_ids),
            "holidays": len(holidays),
            "request_attachments": len(attachment_ids),
            "app_config": 1,
        }
        if counts != metadata.get("counts"):
            raise ValueError("Los recuentos no coinciden con el manifiesto de origen")
        report = {
            "counts": counts,
            "attachment_bytes": attachment_bytes,
            "total_days": str(original_total),
            "inferred_allocation_ids": inferred,
            "disabled_default_admin_ids": blocked_default_admins,
            "fingerprint": fingerprint,
        }
        audit(db, None, "migration.legacy_complete", fingerprint, report)
        db.commit()
        return report
