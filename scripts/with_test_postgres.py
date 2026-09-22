"""Run a foreground command against a disposable PostgreSQL 16 instance.

The supervisor owns and closes PostgreSQL; no service or process is left behind.
Only synthetic test data is permitted here. Never forwards an existing DATABASE_URL.
"""

import getpass
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import psycopg


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python scripts/with_test_postgres.py COMMAND [ARGS...]")
    root = Path(__file__).resolve().parent.parent
    bindir = Path(os.environ.get("TEST_PG_BIN", str(root / ".tools/pg16/bin")))
    version = subprocess.check_output([str(bindir / "postgres"), "--version"], text=True)
    if "PostgreSQL) 16." not in version:
        raise SystemExit("Integration tests require PostgreSQL 16")
    with socket.socket() as socket_handle:
        socket_handle.bind(("127.0.0.1", 0))
        port = socket_handle.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix="vacaciones-pg16-test-") as directory:
        base = Path(directory)
        environment = {
            k: v
            for k, v in os.environ.items()
            if not any(
                marker in k
                for marker in ("DATABASE", "POSTGRES", "GMAIL", "GOOGLE", "SECRET", "TOKEN")
            )
        }
        subprocess.run(
            [
                str(bindir / "initdb"),
                "-D",
                str(base / "data"),
                "--auth=trust",
                "--encoding=UTF8",
                "--no-locale",
            ],
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            check=True,
            timeout=30,
        )
        with (base / "postgres.log").open("wb") as log:
            server = subprocess.Popen(
                [
                    str(bindir / "postgres"),
                    "-D",
                    str(base / "data"),
                    "-h",
                    "127.0.0.1",
                    "-p",
                    str(port),
                    "-k",
                    str(base),
                    "-c",
                    "max_connections=20",
                    "-c",
                    "shared_buffers=32MB",
                ],
                stdout=log,
                stderr=log,
                env=environment,
            )
            try:
                connected = False
                for _ in range(100):
                    if server.poll() is not None:
                        raise RuntimeError("Disposable PostgreSQL did not start")
                    try:
                        with psycopg.connect(
                            host="127.0.0.1",
                            port=port,
                            dbname="postgres",
                            user=getpass.getuser(),
                            autocommit=True,
                            connect_timeout=1,
                        ) as connection:
                            connection.execute("CREATE DATABASE vacaciones_test")
                        connected = True
                        break
                    except psycopg.OperationalError:
                        time.sleep(0.1)
                if not connected:
                    raise RuntimeError("Disposable PostgreSQL readiness timeout")
                url = f"postgresql://{getpass.getuser()}@127.0.0.1:{port}/vacaciones_test"
                environment.update(
                    {
                        "DATABASE_URL": url,
                        "TEST_DATABASE_URL": url,
                        "DATABASE_SSL_MODE": "disable",
                        "APP_ENV": "test",
                        "APP_URL": "http://testserver",
                        "MAIL_ENABLED": "false",
                        "TEST_DATABASE_SUPERVISED": "vacaciones-pg16",
                        "PYTHONPATH": str(root),
                        "PATH": str(root / ".venv/bin") + ":" + environment["PATH"],
                    }
                )
                print("PostgreSQL 16 isolated: starting supervised verification", flush=True)
                result = subprocess.run(sys.argv[1:], cwd=root, env=environment, check=False)
                return result.returncode
            finally:
                server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait(timeout=5)
                print("PostgreSQL 16 isolated: stopped; temporary data removed", flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
