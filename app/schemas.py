import re
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)
from pydantic.alias_generators import to_camel


def real_date(value):
    if isinstance(value, date):
        return value
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Usa una fecha real con formato AAAA-MM-DD")
    result = date.fromisoformat(value)
    if not 1900 <= result.year <= 2200:
        raise ValueError("El año debe estar entre 1900 y 2200")
    return result


ISODate = Annotated[date, BeforeValidator(real_date)]
Role = Literal["worker", "manager", "admin"]
AbsenceType = Literal["vacaciones", "ausencia", "baja", "permiso"]
Password = Annotated[str, Field(min_length=8, max_length=256, strict=True)]
ShortText = Annotated[str, Field(min_length=1, max_length=160, strict=True)]


class Payload(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class Login(Payload):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)


class ChangePassword(Payload):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: Password


class ResetPassword(Payload):
    new_password: Password


class CompleteReset(ResetPassword):
    token: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")


class ForgotPassword(Payload):
    email: EmailStr


class EmployeeCreate(Payload):
    name: ShortText
    email: EmailStr
    username: str = Field(min_length=1, max_length=80, pattern=r"^[\w.@+-]+$")
    password: Password
    role: Role = "worker"
    department: str | None = None
    allowance_override: Decimal | None = Field(default=None, ge=0, le=366)
    birth_date: ISODate | None = None
    share_birthday: bool = Field(default=False, strict=True)

    @field_validator("birth_date", "allowance_override", mode="before")
    @classmethod
    def empty_optional(cls, v):
        return None if v == "" else v


class EmployeeUpdate(Payload):
    name: ShortText | None = None
    email: EmailStr | None = None
    department: str | None = None
    role: Role | None = None
    allowance_override: Decimal | None = Field(default=None, ge=0, le=366)
    active: bool | None = Field(default=None, strict=True)
    birth_date: ISODate | None = None
    share_birthday: bool | None = Field(default=None, strict=True)
    calendar_id: str | None = None
    work_hours: dict[str, Decimal] | None = None
    employed_from: ISODate | None = None
    employed_to: ISODate | None = None

    @field_validator(
        "birth_date", "employed_from", "employed_to", "allowance_override", mode="before"
    )
    @classmethod
    def empty_optional(cls, v):
        return None if v == "" else v

    @field_validator("work_hours")
    @classmethod
    def valid_hours(cls, v):
        if v is not None and (
            not v
            or any(
                k not in "0123456" or len(k) != 1 or not h.is_finite() or not 0 < h <= 24
                for k, h in v.items()
            )
        ):
            raise ValueError("La jornada usa días 0–6 y horas mayores que 0 y hasta 24")
        return v


class RequestCreate(Payload):
    type: AbsenceType
    date_from: ISODate
    date_to: ISODate
    half_start: bool = Field(default=False, strict=True)
    half_end: bool = Field(default=False, strict=True)
    note: str | None = Field(default=None, max_length=2000)
    over_allowance_acknowledged: bool = Field(default=False, strict=True)

    @model_validator(mode="after")
    def range_is_bounded(self):
        if not 0 <= (self.date_to - self.date_from).days <= 366:
            raise ValueError("El rango debe estar ordenado y no superar 367 días")
        return self


class Resolution(Payload):
    action: Literal["approve", "reject", "cancel", "withdraw"]
    decision_note: str | None = Field(default=None, max_length=2000)


class HolidayCreate(Payload):
    date: ISODate
    name: str = Field(min_length=1, max_length=200)
    calendar_id: str = "default"


class CalendarCreate(Payload):
    id: str = Field(pattern=r"^[a-z][a-z0-9_-]{1,79}$")
    name: str = Field(min_length=1, max_length=120)


class DepartmentCreate(CalendarCreate):
    color: str = Field(default="#123a5c", pattern=r"^#[0-9a-fA-F]{6}$")
    minimum_present: int = Field(default=0, ge=0, le=10000, strict=True)


class PolicyUpdate(Payload):
    entitlement: Decimal = Field(ge=0, le=366)
    adjustment: Decimal = Field(default=0, ge=-366, le=366)
    carryover: Decimal = Field(default=0, ge=0, le=366)
    carryover_expiry: ISODate | None = None
    prorate: bool = Field(default=False, strict=True)


class ConfigurationUpdate(Payload):
    default_allowance: Decimal = Field(ge=0, le=366)
    over_allowance: Literal["warn", "block"] = "warn"
    max_away_percent: int = Field(default=30, ge=1, le=100, strict=True)


class DelegationCreate(Payload):
    manager_id: str
    delegate_id: str
    date_from: ISODate
    date_to: ISODate

    @model_validator(mode="after")
    def valid_range(self):
        if (
            self.manager_id == self.delegate_id
            or not 0 <= (self.date_to - self.date_from).days <= 366
        ):
            raise ValueError("Delegación no válida")
        return self


class Invitations(Payload):
    lines: list[str] = Field(min_length=1, max_length=100)
    department: str | None = None
    role: Role = "worker"


class ImportConfirmation(Payload):
    batch_id: str = Field(min_length=1, max_length=80)
    selected: list[Annotated[int, Field(ge=0, strict=True)]] = Field(min_length=1, max_length=5000)


class OutboxRetry(Payload):
    acknowledge_possible_duplicate: bool = Field(default=False, strict=True)
