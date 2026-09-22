"""Export an authorized legacy PostgreSQL snapshot without changing the source.

Run where source access is authorized. SOURCE_DATABASE_URL is read from the environment;
never pass credentials on the command line. The resulting archive contains employee data
and password hashes: transfer privately, keep out of Git, and retain only as agreed.
"""

import argparse
import hashlib
import json
import os
import re
import stat
import zipfile
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

TABLES = ("app_config", "users", "requests", "holidays")


def encode(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError("Unsupported value in source export")


def export_archive(source_url, destination):
    path = Path(destination)
    if path.exists():
        raise ValueError("Refusing to overwrite an existing archive")
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, stat.S_IRUSR | stat.S_IWUSR)
    try:
        with os.fdopen(descriptor, "wb") as output:
            with psycopg.connect(
                source_url, row_factory=dict_row, connect_timeout=10
            ) as connection:
                connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                connection.execute("SET LOCAL statement_timeout = '60s'")
                tables = {}
                for table in TABLES:
                    # Names are a fixed allowlist, not input received from a file or browser.
                    tables[table] = list(connection.execute(f'SELECT * FROM "{table}"').fetchall())
                tables["request_attachments"] = []
                with zipfile.ZipFile(
                    output, "w", compression=zipfile.ZIP_STORED, allowZip64=True
                ) as archive:
                    with connection.cursor(name="attachment_snapshot") as cursor:
                        cursor.itersize = 1
                        cursor.execute("SELECT * FROM request_attachments ORDER BY id")
                        for row in cursor:
                            identifier = row["id"]
                            if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", identifier):
                                raise ValueError("Invalid source attachment identifier")
                            data = bytes(row.pop("data"))
                            if len(data) != row["size_bytes"]:
                                raise ValueError("Source attachment length mismatch")
                            row["sha256"] = hashlib.sha256(data).hexdigest()
                            row["archive_path"] = f"attachments/{identifier}.bin"
                            archive.writestr(row["archive_path"], data)
                            tables["request_attachments"].append(row)
                    metadata = {
                        "format": "electropolis-vacaciones-legacy/1",
                        "tables": tables,
                        "counts": {key: len(rows) for key, rows in tables.items()},
                    }
                    archive.writestr(
                        "metadata.json",
                        json.dumps(
                            metadata, default=encode, sort_keys=True, ensure_ascii=False
                        ).encode(),
                    )
        checksum = hashlib.sha256()
        with path.open("rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                checksum.update(chunk)
        return {"sha256": checksum.hexdigest(), "counts": metadata["counts"]}
    except Exception:
        # Remove only this operation's incomplete output, never an existing user file.
        path.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("destination", help="New private archive path, outside the repository")
    arguments = parser.parse_args()
    url = os.environ.get("SOURCE_DATABASE_URL")
    if not url:
        raise SystemExit("SOURCE_DATABASE_URL is required in the authorized environment")
    try:
        report = export_archive(url, arguments.destination)
    except Exception as exc:
        print(json.dumps({"status": "failed", "reason": type(exc).__name__}))
        return 1
    print(json.dumps({"status": "exported", **report}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
