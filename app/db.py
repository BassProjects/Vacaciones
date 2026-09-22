from collections.abc import Generator

from fastapi import HTTPException, Request
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.models import AuditEvent, Configuration, Employee

SCHEMA_REVISION = "0001_python"


class Database:
    def __init__(self, settings: Settings):
        self.engine = None
        self.sessions = None
        if settings.database_url:
            url = make_url(settings.database_url.replace("postgres://", "postgresql://", 1))
            url = url.set(drivername="postgresql+psycopg")
            if any(key in url.query for key in ("sslkey", "sslcert", "sslrootcert")):
                raise ValueError(
                    "Configurar los certificados PostgreSQL mediante procedimiento explícito"
                )
            url = url.difference_update_query(["sslmode"])
            args = {
                "connect_timeout": 3,
                "sslmode": settings.database_ssl_mode,
                "options": "-c statement_timeout=5000 -c lock_timeout=3000",
            }
            if settings.database_ssl_mode == "verify-full":
                args["sslrootcert"] = "system"
            self.engine = create_engine(
                url,
                connect_args=args,
                pool_pre_ping=True,
                pool_size=4,
                max_overflow=0,
                pool_timeout=3,
                hide_parameters=True,
            )
            self.sessions = sessionmaker(self.engine, expire_on_commit=False)

    def ready(self):
        if self.engine is None:
            return False
        try:
            with self.engine.connect() as conn:
                revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
                admin = conn.execute(
                    select(Employee.id)
                    .where(Employee.active.is_(True), Employee.role == "admin")
                    .limit(1)
                ).scalar()
                configured = conn.execute(
                    select(Configuration.id).where(Configuration.id == 1)
                ).scalar()
                return revision == SCHEMA_REVISION and bool(admin and configured)
        except Exception:
            # Never reveal hostnames, SQL parameters or employee data in readiness.
            return False

    def close(self):
        if self.engine is not None:
            self.engine.dispose()


def get_db(request: Request) -> Generator[Session, None, None]:
    database = request.app.state.database
    if database.sessions is None:
        raise HTTPException(503, "Aplicación pendiente de configuración")
    with database.sessions() as db:
        try:
            yield db
        finally:
            db.rollback()


def audit(db, actor, action, entity_id, details=None, request=None):
    db.add(
        AuditEvent(
            actor_id=actor.id if actor else None,
            action=action,
            entity_id=str(entity_id),
            details=details or {},
            request_id=getattr(request.state, "request_id", None) if request else None,
        )
    )


def lock_configuration(db):
    return db.scalar(select(Configuration).where(Configuration.id == 1).with_for_update())
