import hashlib
import io
import json
import os
import subprocess
import zipfile
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from PIL import Image
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url

from app.config import Settings
from app.db import Database
from app.legacy import import_archive
from app.models import Attachment, Employee, LeaveRequest, RequestDay
from app.security import verify_password
from scripts.export_legacy import export_archive

pytestmark = pytest.mark.postgres


def make_legacy_source(database):
    salt = "ab" * 16
    password = "Synthetic-Legacy-Password-2026"
    password_hash = hashlib.scrypt(
        password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64
    ).hex()
    output = io.BytesIO()
    Image.new("RGB", (8, 8)).save(output, format="PNG")
    image = output.getvalue()
    with database.engine.begin() as connection:
        for statement in [
            "CREATE TABLE app_config (id INT PRIMARY KEY, default_allowance NUMERIC NOT NULL)",
            """CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, username TEXT,
                password_hash TEXT, password_salt TEXT, department TEXT, role TEXT,
                allowance_override NUMERIC, active BOOLEAN, birth_date TEXT,
                created_at TIMESTAMPTZ)""",
            """CREATE TABLE requests (id TEXT PRIMARY KEY, user_id TEXT, user_name TEXT,
                department TEXT,
                type TEXT, date_from TEXT, date_to TEXT, half_start BOOLEAN, half_end BOOLEAN,
                days NUMERIC, status TEXT, note TEXT, requested_at TIMESTAMPTZ,
                resolved_at TIMESTAMPTZ,
                resolved_by TEXT, decision_note TEXT)""",
            "CREATE TABLE holidays (date TEXT PRIMARY KEY, name TEXT)",
            """CREATE TABLE request_attachments (id TEXT PRIMARY KEY, request_id TEXT,
                filename TEXT,
                mime_type TEXT, size_bytes INT, data BYTEA, uploaded_by TEXT,
                uploaded_at TIMESTAMPTZ)""",
        ]:
            connection.execute(text(statement))
        connection.execute(text("INSERT INTO app_config VALUES (1,22.5)"))
        for identifier, name, username, role, department in [
            ("legacy-admin", "Administrador sintético", "legacy-admin", "admin", None),
            ("legacy-worker", "Trabajador sintético", "legacy-worker", "worker", "marketing"),
        ]:
            connection.execute(
                text("""INSERT INTO users VALUES
                (:id,:name,:email,:username,:hash,:salt,:department,:role,NULL,TRUE,
                '1990-07-03','2026-01-01T00:00:00Z')"""),
                {
                    "id": identifier,
                    "name": name,
                    "email": username + "@example.com",
                    "username": username,
                    "hash": password_hash,
                    "salt": salt,
                    "department": department,
                    "role": role,
                },
            )
        connection.execute(text("INSERT INTO holidays VALUES ('2027-01-01','Festivo sintético')"))
        connection.execute(
            text("""INSERT INTO requests VALUES
            ('legacy-request','legacy-worker','Trabajador sintético','marketing','vacaciones',
            '2026-12-31','2027-01-04',FALSE,FALSE,2,'approved','Nota histórica privada',
            '2026-09-01T10:00:00Z','2026-09-02T10:00:00Z',
            'Administrador sintético','Aprobada en origen')""")
        )
        connection.execute(
            text("""INSERT INTO requests VALUES
            ('legacy-fraction','legacy-worker','Trabajador sintético','marketing','baja',
            '2026-10-19','2026-10-21',FALSE,FALSE,1.3,'approved','Fracción histórica',
            '2026-09-01T10:00:00Z','2026-09-02T10:00:00Z','Administrador sintético',NULL)""")
        )
        connection.execute(
            text("""INSERT INTO request_attachments VALUES
            ('legacy-attachment','legacy-fraction','prueba.png','image/png',:size,:data,
            'Trabajador sintético','2026-09-01T11:00:00Z')"""),
            {"size": len(image), "data": image},
        )
    return password, image


def test_legacy_snapshot_roundtrip_preserves_ids_hashes_totals_and_files(database, tmp_path):
    password, image = make_legacy_source(database)
    archive = tmp_path / "legacy.zip"
    report = export_archive(os.environ["TEST_DATABASE_URL"], archive)
    assert report["counts"] == {
        "users": 2,
        "requests": 2,
        "holidays": 1,
        "request_attachments": 1,
        "app_config": 1,
    }
    with database.sessions() as db:
        imported = import_archive(db, archive, report["sha256"])
        assert imported["total_days"] == "3.3"
        assert imported["inferred_allocation_ids"] == ["legacy-fraction"]
        employee = db.get(Employee, "legacy-admin")
        assert verify_password(
            password, employee.password_hash, employee.password_salt, employee.password_scheme
        )
        assert employee.active and not employee.share_birthday
        assert db.get(Attachment, "legacy-attachment").data == image
        assert db.scalar(select(func.sum(RequestDay.units))) == Decimal("3.3")
        assert db.get(RequestDay, ("legacy-request", date(2027, 1, 4))).units == 1
        assert db.get(LeaveRequest, "legacy-request").note == "Nota histórica privada"
        assert import_archive(db, archive, report["sha256"])["duplicate"]
    with database.engine.connect() as connection:
        assert connection.execute(text("SELECT COUNT(*) FROM users")).scalar() == 2
        assert connection.execute(text("SELECT SUM(days) FROM requests")).scalar() == Decimal("3.3")
    assert database.ready()


def test_invalid_legacy_archive_does_not_partially_import(database, tmp_path):
    make_legacy_source(database)
    original = tmp_path / "original.zip"
    report = export_archive(os.environ["TEST_DATABASE_URL"], original)
    invalid = tmp_path / "invalid.zip"
    with zipfile.ZipFile(original) as source, zipfile.ZipFile(invalid, "w") as destination:
        for name in source.namelist():
            data = source.read(name)
            if name == "metadata.json":
                metadata = json.loads(data)
                metadata["tables"]["requests"][0]["date_from"] = "2026-02-30"
                data = json.dumps(metadata).encode()
            destination.writestr(name, data)
    with database.sessions() as db:
        with pytest.raises(ValueError):
            import_archive(db, invalid, report["sha256"])
        db.rollback()
        with pytest.raises(ValueError):
            import_archive(db, invalid, hashlib.sha256(invalid.read_bytes()).hexdigest())
        db.rollback()
        assert db.scalar(select(func.count()).select_from(Employee)) == 0
        assert db.scalar(select(func.count()).select_from(LeaveRequest)) == 0


def test_postgresql_backup_can_restore_the_migrated_database(database, tmp_path):
    make_legacy_source(database)
    archive = tmp_path / "legacy.zip"
    report = export_archive(os.environ["TEST_DATABASE_URL"], archive)
    with database.sessions() as db:
        import_archive(db, archive, report["sha256"])
    url = make_url(os.environ["TEST_DATABASE_URL"])
    bindir = Path(
        os.environ.get(
            "TEST_PG_BIN", str(Path(__file__).resolve().parent.parent / ".tools/pg16/bin")
        )
    )
    backup = tmp_path / "recovery.dump"
    args = ["-h", "127.0.0.1", "-p", str(url.port), "-U", url.username]
    subprocess.run(
        [str(bindir / "pg_dump"), *args, "-Fc", "-f", str(backup), "vacaciones_test"],
        check=True,
        capture_output=True,
        timeout=30,
    )
    with database.engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        connection.execute(text("CREATE DATABASE vacaciones_restore_test"))
    restored = None
    try:
        subprocess.run(
            [
                str(bindir / "pg_restore"),
                *args,
                "--exit-on-error",
                "--no-owner",
                "-d",
                "vacaciones_restore_test",
                str(backup),
            ],
            check=True,
            capture_output=True,
            timeout=30,
        )
        restored = Database(
            Settings(
                database_url=url.set(database="vacaciones_restore_test").render_as_string(),
                database_ssl_mode="disable",
                environment="test",
                mail_enabled=False,
            )
        )
        assert restored.ready()
        with restored.sessions() as db:
            assert db.scalar(select(func.count()).select_from(Employee)) == 2
            assert db.scalar(select(func.count()).select_from(LeaveRequest)) == 2
            assert db.scalar(select(func.sum(RequestDay.units))) == Decimal("3.3")
            attachment = db.get(Attachment, "legacy-attachment")
            assert hashlib.sha256(attachment.data).hexdigest() == attachment.sha256
    finally:
        if restored:
            restored.close()
        with database.engine.connect().execution_options(
            isolation_level="AUTOCOMMIT"
        ) as connection:
            connection.execute(text("DROP DATABASE vacaciones_restore_test"))
