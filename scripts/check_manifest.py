"""Validate this template's small manifest; JSON is also valid YAML 1.2."""

import json
from pathlib import Path


def main():
    data = json.loads(Path("service.yaml").read_text())
    expected = {
        "standard": "1.0.0",
        "template": "web/1.0.0",
        "runtime": "python3.11",
        "port": 8080,
        "health_path": "/health",
        "readiness_path": "/ready",
    }
    if data != expected:
        raise SystemExit("service.yaml no coincide con el contrato de la plantilla web/1.0.0")
    print("Manifiesto web/1.0.0: OK")


if __name__ == "__main__":
    main()
