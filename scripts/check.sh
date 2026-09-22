#!/bin/sh
set -eu
uv sync --locked
uv run --locked python scripts/check_manifest.py
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked pytest -q
