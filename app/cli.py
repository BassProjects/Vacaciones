"""Explicit operations executed inside the selected application's environment."""

import argparse
import json
import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import httpx
from alembic import command
from alembic.config import Config
from pydantic import EmailStr, TypeAdapter
from sqlalchemy import delete, func, select, text

from app.config import Settings
from app.db import Database, audit, lock_configuration
from app.legacy import import_archive
from app.mailer import drain
from app.models import AuthThrottle, Employee, ImportBatch, PasswordReset, SessionToken, new_id, now
from app.security import hash_password


def migrate(database):
    if database.engine is None:
        raise ValueError("DATABASE_URL is required")
    configuration = Config(str(Path(__file__).parent.parent / "alembic.ini"))
    configuration.set_main_option(
        "script_location", str(Path(__file__).parent.parent / "migrations")
    )
    with database.engine.connect() as connection:
        version = int(connection.execute(text("SHOW server_version_num")).scalar())
        if version // 10000 != 16:
            raise ValueError("This application requires PostgreSQL 16")
        locked = connection.execute(text("SELECT pg_try_advisory_lock(768429114)")).scalar()
        connection.commit()
        if not locked:
            raise ValueError("Another schema operation is active")
        try:
            configuration.attributes["connection"] = connection
            command.upgrade(configuration, "head")
        finally:
            connection.rollback()
            connection.execute(text("SELECT pg_advisory_unlock(768429114)"))
            connection.commit()
    return {"status": "migrated", "revision": "0001_python"}


def bootstrap_admin(database):
    email = str(
        TypeAdapter(EmailStr).validate_python(os.environ.get("BOOTSTRAP_ADMIN_EMAIL", ""))
    ).lower()
    username = os.environ.get("BOOTSTRAP_ADMIN_USERNAME", "").strip().lower()
    password = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "")
    if not username or len(username) > 80 or len(password) < 16:
        raise ValueError(
            "Explicit administrator identity and a password of at least 16 characters are required"
        )
    with database.sessions() as db:
        lock_configuration(db)
        if db.scalar(
            select(func.count())
            .select_from(Employee)
            .where(Employee.role == "admin", Employee.active.is_(True))
        ):
            raise ValueError(
                "An active administrator already exists; "
                "use the authenticated administration interface"
            )
        if db.scalar(
            select(Employee.id).where((Employee.username == username) | (Employee.email == email))
        ):
            raise ValueError(
                "The selected administrator identity already exists; do not overwrite it"
            )
        password_hash, salt, scheme = hash_password(password)
        user = Employee(
            id=new_id(),
            name=os.environ.get("BOOTSTRAP_ADMIN_NAME", "Administración"),
            email=email,
            username=username,
            password_hash=password_hash,
            password_salt=salt,
            password_scheme=scheme,
            role="admin",
            active=True,
            must_change_password=True,
        )
        db.add(user)
        db.flush()
        audit(db, None, "admin.bootstrapped", user.id)
        db.commit()
    return {"status": "administrator_created", "password_change_required": True}


def maintenance(database):
    with database.sessions() as db:
        counts = {}
        for model, condition in [
            (SessionToken, SessionToken.expires_at <= now()),
            (PasswordReset, PasswordReset.expires_at <= now()),
            (AuthThrottle, AuthThrottle.expires_at <= now()),
        ]:
            counts[model.__tablename__] = db.execute(delete(model).where(condition)).rowcount
        # Unconfirmed previews expire. Confirmed fingerprints remain as deduplication records.
        counts["expired_previews"] = db.execute(
            delete(ImportBatch).where(
                ImportBatch.confirmed.is_(False), ImportBatch.expires_at <= now()
            )
        ).rowcount
        db.commit()
    return {"status": "maintenance_completed", "removed_transient_records": counts}


def import_from_url(database):
    url = os.environ.get("MIGRATION_ARCHIVE_URL", "")
    fingerprint = os.environ.get("MIGRATION_ARCHIVE_SHA256", "")
    if urlparse(url).scheme != "https" or not fingerprint:
        raise ValueError("An authorized HTTPS archive and its expected fingerprint are required")
    with tempfile.TemporaryDirectory(prefix="vacaciones-transfer-") as directory:
        target = Path(directory) / "snapshot.zip"
        total = 0
        with httpx.Client(
            timeout=httpx.Timeout(30, connect=10), trust_env=True, follow_redirects=False
        ) as client:
            with client.stream("GET", url) as response:
                response.raise_for_status()
                with target.open("xb") as output:
                    target.chmod(0o600)
                    for chunk in response.iter_bytes():
                        total += len(chunk)
                        if total > 512 * 1024 * 1024:
                            raise ValueError("Archive requires an explicitly segmented transfer")
                        output.write(chunk)
        with database.sessions() as db:
            result = import_archive(db, target, fingerprint)
        return {"status": "imported", **result}


def main():
    parser = argparse.ArgumentParser(description="Controlled Electropolis Vacaciones operations")
    subcommands = parser.add_subparsers(dest="operation", required=True)
    for name in ("migrate", "bootstrap-admin", "maintenance", "import-legacy-url", "status"):
        subcommands.add_parser(name)
    mail = subcommands.add_parser("mail-drain")
    mail.add_argument("--limit", type=int, default=10)
    mail.add_argument("--seconds", type=int, default=45)
    local_import = subcommands.add_parser("import-legacy")
    local_import.add_argument("archive")
    local_import.add_argument("--sha256", required=True)
    arguments = parser.parse_args()
    database = None
    try:
        settings = Settings()
        database = Database(settings)
        if database.sessions is None:
            raise ValueError("Database configuration is required")
        if arguments.operation == "migrate":
            result = migrate(database)
        elif arguments.operation == "bootstrap-admin":
            result = bootstrap_admin(database)
        elif arguments.operation == "mail-drain":
            if not 1 <= arguments.limit <= 25 or not 1 <= arguments.seconds <= 120:
                raise ValueError("Mail batch limits are outside the permitted range")
            result = drain(database, settings, arguments.limit, arguments.seconds)
        elif arguments.operation == "maintenance":
            result = maintenance(database)
        elif arguments.operation == "import-legacy-url":
            result = import_from_url(database)
        elif arguments.operation == "import-legacy":
            with database.sessions() as db:
                result = import_archive(db, arguments.archive, arguments.sha256)
        else:
            result = {
                "ready": database.ready(),
                "mail_enabled": settings.mail_enabled,
                "mail_configured": settings.mail_configured,
            }
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:
        # URLs, credentials, SQL parameters and employee data never enter job logs.
        print(
            json.dumps(
                {
                    "status": "failed",
                    "operation": arguments.operation,
                    "error_type": type(exc).__name__,
                }
            )
        )
        return 1
    finally:
        if database:
            database.close()


if __name__ == "__main__":
    raise SystemExit(main())
