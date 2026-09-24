"""PostgreSQL model. Schema changes are made by Alembic, never by web startup."""

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now():
    return datetime.now(timezone.utc)


def new_id():
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Calendar(Base):
    __tablename__ = "work_calendars"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    color: Mapped[str] = mapped_column(String(7), default="#123a5c")
    minimum_present: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (CheckConstraint("minimum_present >= 0"),)


class Configuration(Base):
    __tablename__ = "configuration"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    default_allowance: Mapped[Decimal] = mapped_column(Numeric(8, 4), default=Decimal("22.5"))
    over_allowance: Mapped[str] = mapped_column(String(10), default="warn")
    max_away_percent: Mapped[int] = mapped_column(Integer, default=30)
    __table_args__ = (
        CheckConstraint("id = 1"),
        CheckConstraint("default_allowance >= 0"),
        CheckConstraint("over_allowance IN ('warn','block')"),
        CheckConstraint("max_away_percent BETWEEN 1 AND 100"),
    )


class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str | None] = mapped_column(String(254), unique=True)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    password_salt: Mapped[str] = mapped_column(String(128))
    password_scheme: Mapped[str] = mapped_column(String(30), default="scrypt-v2")
    department: Mapped[str | None] = mapped_column(ForeignKey("departments.id"))
    role: Mapped[str] = mapped_column(String(20), default="worker")
    allowance_override: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    onboarding_pending: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    birth_date: Mapped[date | None] = mapped_column(Date)
    share_birthday: Mapped[bool] = mapped_column(Boolean, default=False)
    calendar_id: Mapped[str] = mapped_column(ForeignKey("work_calendars.id"), default="default")
    work_hours: Mapped[dict] = mapped_column(JSONB, default=lambda: {str(i): "8" for i in range(5)})
    employed_from: Mapped[date | None] = mapped_column(Date)
    employed_to: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (
        CheckConstraint("role IN ('worker','manager','admin')"),
        CheckConstraint("allowance_override IS NULL OR allowance_override >= 0"),
        CheckConstraint(
            "employed_to IS NULL OR employed_from IS NULL OR employed_to >= employed_from"
        ),
        Index("ix_employees_department_active", "department", "active"),
    )


class Holiday(Base):
    __tablename__ = "calendar_holidays"
    calendar_id: Mapped[str] = mapped_column(ForeignKey("work_calendars.id"), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))


class Policy(Base):
    __tablename__ = "annual_policies"
    user_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), primary_key=True)
    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    entitlement: Mapped[Decimal] = mapped_column(Numeric(8, 4))
    adjustment: Mapped[Decimal] = mapped_column(Numeric(8, 4), default=0)
    carryover: Mapped[Decimal] = mapped_column(Numeric(8, 4), default=0)
    carryover_expiry: Mapped[date | None] = mapped_column(Date)
    prorate: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (
        CheckConstraint("year BETWEEN 1900 AND 2200"),
        CheckConstraint("entitlement >= 0 AND carryover >= 0"),
    )


class Delegation(Base):
    __tablename__ = "approval_delegations"
    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=new_id)
    manager_id: Mapped[str] = mapped_column(ForeignKey("employees.id"))
    delegate_id: Mapped[str] = mapped_column(ForeignKey("employees.id"))
    date_from: Mapped[date] = mapped_column(Date)
    date_to: Mapped[date] = mapped_column(Date)
    __table_args__ = (
        CheckConstraint("manager_id <> delegate_id AND date_to >= date_from"),
        UniqueConstraint("manager_id", "delegate_id", "date_from", "date_to"),
    )


class LeaveRequest(Base):
    __tablename__ = "leave_requests"
    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("employees.id"))
    user_name: Mapped[str] = mapped_column(String(160))
    department: Mapped[str] = mapped_column(ForeignKey("departments.id"))
    type: Mapped[str] = mapped_column(String(20))
    date_from: Mapped[date] = mapped_column(Date)
    date_to: Mapped[date] = mapped_column(Date)
    half_start: Mapped[bool] = mapped_column(Boolean, default=False)
    half_end: Mapped[bool] = mapped_column(Boolean, default=False)
    days: Mapped[Decimal] = mapped_column(Numeric(12, 4))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    note: Mapped[str | None] = mapped_column(Text)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[str | None] = mapped_column(String(160))
    decision_note: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(30), default="native")
    source_key: Mapped[str | None] = mapped_column(String(64), unique=True)
    request_key: Mapped[str | None] = mapped_column(String(80))
    payload_hash: Mapped[str | None] = mapped_column(String(64))
    over_allowance_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (
        CheckConstraint("type IN ('vacaciones','ausencia','baja','permiso')"),
        CheckConstraint("status IN ('pending','approved','rejected','cancelled')"),
        CheckConstraint("date_to >= date_from AND days > 0"),
        UniqueConstraint("user_id", "request_key"),
        Index("ix_requests_user_dates", "user_id", "date_from", "date_to"),
        Index("ix_requests_dept_status", "department", "status"),
    )


class RequestDay(Base):
    __tablename__ = "request_days"
    request_id: Mapped[str] = mapped_column(ForeignKey("leave_requests.id"), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    units: Mapped[Decimal] = mapped_column(Numeric(12, 4))
    hours: Mapped[Decimal] = mapped_column(Numeric(12, 4))
    __table_args__ = (
        CheckConstraint("units > 0 AND hours > 0"),
        Index("ix_request_days_date", "date"),
    )


class Attachment(Base):
    __tablename__ = "attachments"
    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=new_id)
    request_id: Mapped[str] = mapped_column(ForeignKey("leave_requests.id"), index=True)
    filename: Mapped[str] = mapped_column(String(200))
    mime_type: Mapped[str] = mapped_column(String(80))
    size_bytes: Mapped[int] = mapped_column(Integer)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    sha256: Mapped[str] = mapped_column(String(64))
    uploaded_by: Mapped[str] = mapped_column(String(160))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (CheckConstraint("size_bytes > 0"),)


class SessionToken(Base):
    __tablename__ = "auth_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuthThrottle(Base):
    __tablename__ = "auth_throttles"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PasswordReset(Base):
    __tablename__ = "password_resets"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class ActivationToken(Base):
    __tablename__ = "employee_activations"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    email: Mapped[str] = mapped_column(String(254))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=new_id)
    actor_id: Mapped[str | None] = mapped_column(String(80))
    action: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[str] = mapped_column(String(80), index=True)
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    request_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class ImportBatch(Base):
    __tablename__ = "import_batches"
    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("employees.id"))
    kind: Mapped[str] = mapped_column(String(30))
    fingerprint: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSONB)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (UniqueConstraint("kind", "fingerprint"),)


class Outbox(Base):
    __tablename__ = "mail_outbox"
    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=new_id)
    event_key: Mapped[str] = mapped_column(String(200), unique=True)
    recipient: Mapped[str] = mapped_column(String(254))
    subject: Mapped[str] = mapped_column(String(200))
    template: Mapped[str] = mapped_column(String(40), default="notification.html")
    context: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_error: Mapped[str | None] = mapped_column(String(80))
    gmail_message_id: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (
        CheckConstraint("status IN ('pending','sending','sent','failed','uncertain')"),
    )
