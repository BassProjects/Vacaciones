"""One document, one bounded process. Never inherits production credentials."""

import base64
import json
import resource
import sys


def main():
    resource.setrlimit(resource.RLIMIT_CPU, (5, 6))
    resource.setrlimit(resource.RLIMIT_AS, (384 * 1024 * 1024, 384 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    from app.file_parsers import inspect_attachment, parse_calamari, parse_holidays

    try:
        message = json.loads(sys.stdin.buffer.read(12 * 1024 * 1024))
        data = base64.b64decode(message["data"], validate=True)
        if not 0 < len(data) <= 8 * 1024 * 1024:
            raise ValueError("El archivo debe ocupar entre 1 byte y 8 MB")
        kind = message["kind"]
        name = str(message.get("name", ""))[:200]
        if kind == "holidays":
            result = parse_holidays(data, name)
        elif kind == "calamari":
            result = parse_calamari(data, name)
        elif kind == "attachment":
            result = inspect_attachment(data)
        else:
            raise ValueError("Tipo de importación no válido")
        output = json.dumps(result, ensure_ascii=False)
        if len(output.encode()) > 4 * 1024 * 1024:
            raise ValueError("El resultado contiene demasiados registros")
        print(output)
    except Exception:
        # Parser exceptions can embed document contents; never log or return them.
        print(
            json.dumps(
                {
                    "error": "No se puede procesar el archivo: "
                    "formato, contenido o límites no válidos"
                }
            )
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
