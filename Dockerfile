FROM docker.io/library/python@sha256:2582a354217437c4c50f5668852c024c343b0d1361c8e16214684a867f6c35cd AS build
ENV UV_PYTHON_DOWNLOADS=never UV_NO_CACHE=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
RUN python -m venv /opt/uv && /opt/uv/bin/pip install --no-cache-dir uv==0.12.17
ENV PATH=/opt/uv/bin:$PATH
COPY . .
RUN sh scripts/check.sh && uv sync --locked --no-dev

FROM docker.io/library/python@sha256:2582a354217437c4c50f5668852c024c343b0d1361c8e16214684a867f6c35cd
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH=/app/.venv/bin:$PATH
WORKDIR /app
COPY --from=build --chown=1000:1000 /app/.venv /app/.venv
COPY --from=build --chown=1000:1000 /app/app /app/app
COPY --from=build --chown=1000:1000 /app/migrations /app/migrations
COPY --from=build --chown=1000:1000 /app/alembic.ini /app/alembic.ini
COPY --from=build --chown=1000:1000 /app/service.yaml /app/service.yaml
COPY --from=build --chown=1000:1000 /app/scripts/export_legacy.py /app/scripts/export_legacy.py
USER 1000:1000
EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log", "--no-proxy-headers", "--limit-concurrency", "16", "--timeout-keep-alive", "5"]
