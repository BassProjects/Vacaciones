import base64
import json
import subprocess
import sys
import threading
from pathlib import Path

from fastapi import HTTPException

PARSER_SLOT = threading.BoundedSemaphore(1)


def parse_document(kind, data, name):
    if not 0 < len(data) <= 8 * 1024 * 1024:
        raise HTTPException(413, "El archivo debe ocupar entre 1 byte y 8 MB")
    payload = json.dumps(
        {"kind": kind, "name": name, "data": base64.b64encode(data).decode()}
    ).encode()
    with PARSER_SLOT:
        try:
            result = subprocess.run(
                [sys.executable, "-m", "app.file_worker"],
                input=payload,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=8,
                cwd=Path(__file__).resolve().parent.parent,
                env={
                    "PATH": "/usr/local/bin:/usr/bin:/bin",
                    "LANG": "C.UTF-8",
                    "PYTHONDONTWRITEBYTECODE": "1",
                },
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(
                422, "El documento supera el tiempo de procesamiento permitido"
            ) from exc
    if result.returncode or len(result.stdout) > 4 * 1024 * 1024:
        raise HTTPException(
            422, "Archivo no válido, demasiado complejo o fuera de los límites admitidos"
        )
    try:
        return json.loads(result.stdout)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(422, "No se ha podido analizar el documento") from exc


def bounded_file(upload, maximum=8 * 1024 * 1024):
    value = upload.file.read(maximum + 1)
    if not 0 < len(value) <= maximum:
        raise HTTPException(413, "El archivo debe ocupar entre 1 byte y 8 MB")
    return value
