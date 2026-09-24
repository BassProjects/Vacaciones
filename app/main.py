import hmac
import json
import logging
import re
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

import anyio
from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import Settings
from app.db import Database
from app.security import CSRF_COOKIE, SESSION_COOKIE, administrator, csrf_for

ROOT = Path(__file__).parent
logger = logging.getLogger("electropolis.requests")
logger.setLevel(logging.INFO)
if not logger.handlers:
    logger.addHandler(logging.StreamHandler())
logger.propagate = False


class BodyLimitMiddleware:
    """Reject oversized bodies even with chunked transfer or false Content-Length."""

    def __init__(self, app, limit):
        self.app, self.limit = app, limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] in {"GET", "HEAD", "OPTIONS"}:
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            declared = self.limit + 1
        if declared > self.limit or declared < 0:
            return await JSONResponse(
                {"error": "El archivo o la petición supera el límite permitido"}, status_code=413
            )(scope, receive, send)
        pieces, total = [], 0
        try:
            with anyio.fail_after(30):
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    part = message.get("body", b"")
                    total += len(part)
                    if total > self.limit:
                        return await JSONResponse(
                            {"error": "El archivo o la petición supera el límite permitido"},
                            status_code=413,
                        )(scope, receive, send)
                    pieces.append(part)
                    if not message.get("more_body", False):
                        break
        except TimeoutError:
            return await JSONResponse(
                {"error": "La carga ha excedido el tiempo permitido"}, status_code=408
            )(scope, receive, send)
        sent = False

        async def replay():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": b"".join(pieces), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)


def create_app(settings=None):
    settings = settings or Settings()
    database = Database(settings)

    @asynccontextmanager
    async def lifespan(application):
        anyio.to_thread.current_default_thread_limiter().total_tokens = 4
        yield
        database.close()

    application = FastAPI(
        title="Vacaciones · Sepiamary",
        version="2.0.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    application.state.settings = settings
    application.state.database = database
    templates = Jinja2Templates(directory=ROOT / "templates")
    application.state.templates = templates

    @application.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        if isinstance(exc.detail, dict):
            payload = {"error": exc.detail.get("message", "Operación rechazada"), **exc.detail}
        else:
            payload = {"error": exc.detail}
        return JSONResponse(payload, status_code=exc.status_code, headers=exc.headers)

    @application.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        errors = [
            {"field": ".".join(str(p) for p in e["loc"]), "type": e["type"]}
            for e in exc.errors()[:10]
        ]
        return JSONResponse(
            {"error": "Revisa los campos: fechas, formato o límites no válidos", "fields": errors},
            status_code=422,
        )

    @application.exception_handler(IntegrityError)
    async def integrity_error(request, exc):
        return JSONResponse(
            {"error": "Conflicto con datos existentes. Recarga y revisa la operación"},
            status_code=409,
        )

    @application.exception_handler(SQLAlchemyError)
    async def database_error(request, exc):
        return JSONResponse(
            {"error": "Base de datos no disponible o pendiente de preparación"}, status_code=503
        )

    @application.middleware("http")
    async def security_and_log(request: Request, call_next):
        supplied = request.headers.get("x-request-id", "")
        request_id = (
            supplied if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", supplied) else uuid.uuid4().hex
        )
        request.state.request_id = request_id
        started, status = time.monotonic(), 500
        try:
            if request.method not in {"GET", "HEAD", "OPTIONS"}:
                origin = request.headers.get("origin")
                expected_origin = settings.app_url or str(request.base_url).rstrip("/")
                # A missing APP_URL behind the TLS proxy is tolerated only for the same host.
                origin_ok = (
                    not origin
                    or (origin == expected_origin)
                    or (
                        not settings.app_url
                        and urlparse(origin).netloc == request.url.netloc
                        and urlparse(origin).scheme in {"http", "https"}
                    )
                )
                token = request.cookies.get(SESSION_COOKIE, "")
                cookie_csrf = request.cookies.get(CSRF_COOKIE, "")
                expected_csrf = (
                    csrf_for(token) if re.fullmatch(r"[A-Za-z0-9_-]{43}", token) else cookie_csrf
                )
                supplied_csrf = request.headers.get("x-csrf-token", "")
                csrf_ok = bool(
                    expected_csrf
                    and re.fullmatch(r"[a-f0-9]{64}", supplied_csrf)
                    and hmac.compare_digest(supplied_csrf, expected_csrf)
                )
                if (
                    not origin_ok
                    or request.headers.get("sec-fetch-site") == "cross-site"
                    or not csrf_ok
                ):
                    response = JSONResponse(
                        {"error": "La verificación de seguridad ha caducado. Recarga la página"},
                        status_code=403,
                    )
                else:
                    response = await call_next(request)
            else:
                response = await call_next(request)
            status = response.status_code
            response.headers["x-request-id"] = request_id
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Referrer-Policy"] = "no-referrer"
            response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; "
                "base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
            )
            if not request.url.path.startswith("/static/"):
                response.headers["Cache-Control"] = "no-store"
            if request.method == "GET" and request.url.path in {"/", "/admin", "/activate"}:
                token = request.cookies.get(SESSION_COOKIE, "")
                value = (
                    csrf_for(token)
                    if re.fullmatch(r"[A-Za-z0-9_-]{43}", token)
                    else secrets.token_hex(32)
                )
                response.set_cookie(
                    CSRF_COOKIE,
                    value,
                    secure=settings.secure_cookies,
                    httponly=False,
                    samesite="strict",
                    path="/",
                )
            return response
        finally:
            route = request.scope.get("route")
            logger.info(
                json.dumps(
                    {
                        "event": "http_request",
                        "request_id": request_id,
                        "method": request.method,
                        "route": getattr(route, "path", "unmatched"),
                        "status": status,
                        "duration_ms": round((time.monotonic() - started) * 1000),
                    }
                )
            )

    @application.get("/health")
    def health():
        return {"status": "ok"}

    @application.get("/ready")
    def ready():
        if not database.ready():
            return JSONResponse({"status": "not_ready"}, status_code=503)
        return {"status": "ready"}

    @application.get("/", include_in_schema=False)
    def home(request: Request):
        return templates.TemplateResponse(
            request=request,
            name="index.html",
            context={"configured": database.ready(), "name": "Vacaciones · Sepiamary"},
        )

    @application.get("/activate", include_in_schema=False)
    def activation_page(request: Request):
        from datetime import timedelta

        from app.permissions import today

        return templates.TemplateResponse(
            request=request,
            name="activate.html",
            context={"birth_max": (today() - timedelta(days=1)).isoformat()},
        )

    @application.get("/admin", include_in_schema=False)
    def operations(request: Request, me=Depends(administrator)):
        return templates.TemplateResponse(request=request, name="admin.html", context={"me": me})

    @application.get("/api/openapi.json", include_in_schema=False)
    def openapi(me=Depends(administrator)):
        return application.openapi()

    from app.routes import (
        admin,
        attachments,
        auth,
        employee_management,
        imports,
        registration,
        requests,
        users,
    )

    for module in (
        auth,
        users,
        requests,
        attachments,
        imports,
        admin,
        registration,
        employee_management,
    ):
        application.include_router(module.router)
    application.mount(
        "/static", StaticFiles(directory=ROOT / "static", check_dir=False), name="static"
    )
    application.add_middleware(BodyLimitMiddleware, limit=settings.max_request_bytes)
    return application


app = create_app()
