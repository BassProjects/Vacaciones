import hashlib
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.calendar_rules import (
    allocate_days,
    legacy_allocation,
    prorated_entitlement,
    split_years,
)
from app.config import Settings
from app.main import create_app
from app.schemas import EmployeeUpdate, RequestCreate, real_date
from app.security import csrf_for, hash_password, verify_password


@pytest.mark.parametrize(
    "value",
    [
        "2026-02-30",
        "2026-13-01",
        "2026-00-10",
        "2026-01-00",
        "2026-1-01",
        "2026-01-1",
        "2026-01-01T00:00:00Z",
        1790000000,
        "1899-12-31",
        "2201-01-01",
    ],
)
def test_dates_reject_normalization_and_unsupported_values(value):
    with pytest.raises((ValueError, TypeError)):
        real_date(value)


def test_leap_day_is_real():
    assert real_date("2024-02-29") == date(2024, 2, 29)
    with pytest.raises(ValueError):
        real_date("2026-02-29")


def test_workdays_exclude_holidays_and_weekends():
    rows = allocate_days(date(2026, 10, 16), date(2026, 10, 20), holidays={date(2026, 10, 19)})
    assert [r.date for r in rows] == [date(2026, 10, 16), date(2026, 10, 20)]
    assert sum(r.units for r in rows) == 2


def test_half_days_apply_to_the_selected_working_endpoint_only():
    with pytest.raises(ValueError):
        allocate_days(date(2026, 9, 19), date(2026, 9, 21), half_start=True)
    result = allocate_days(date(2026, 9, 21), date(2026, 9, 21), half_start=True, half_end=True)
    assert result[0].units == Decimal("0.5")
    assert result[0].hours == 4


def test_year_boundaries_are_split_by_date_not_start_year():
    rows = allocate_days(date(2026, 12, 31), date(2027, 1, 4), holidays={date(2027, 1, 1)})
    assert split_years(rows) == {2026: Decimal(1), 2027: Decimal(1)}


def test_individual_work_schedules_can_include_saturday():
    rows = allocate_days(date(2026, 9, 19), date(2026, 9, 19), hours={"5": "6"})
    assert rows[0].hours == 6 and rows[0].units == 1


def test_proration_is_explicit_and_leap_year_aware():
    result = prorated_entitlement(22, 2024, date(2024, 7, 1), None)
    assert result == (Decimal(22) * 184 / 366).quantize(Decimal("0.0001"))
    assert prorated_entitlement(22, 2026) == 22
    assert prorated_entitlement(22, 2026, date(2027, 1, 1)) == 0


def test_legacy_allocation_preserves_totals_and_flags_inference():
    rows, inferred = legacy_allocation(
        date(2026, 10, 19), date(2026, 10, 21), Decimal("1.3"), False, False, set()
    )
    assert inferred and sum(r.units for r in rows) == Decimal("1.3")
    assert sum(r.hours for r in rows) == Decimal("10.4")


def test_request_validation_is_strict_for_booleans_and_range():
    with pytest.raises(ValidationError):
        RequestCreate(
            type="vacaciones", dateFrom="2026-01-01", dateTo="2026-01-02", halfStart="false"
        )
    with pytest.raises(ValidationError):
        RequestCreate(type="vacaciones", dateFrom="2026-01-01", dateTo="2028-01-02")
    with pytest.raises(ValidationError):
        RequestCreate(type="vacaciones", dateFrom="2026-02-30", dateTo="2026-03-02")
    with pytest.raises(ValidationError):
        EmployeeUpdate(workHours={"7": "8"})


def test_passwords_are_salted_and_verify_legacy_node_hashes():
    password = "Synthetic-only-long-password"
    first = hash_password(password)
    second = hash_password(password)
    assert first[0] != second[0] and first[1] != second[1]
    assert verify_password(password, *first)
    assert not verify_password("Wrong-password-here", *first)
    salt = "12" * 16
    legacy_hash = hashlib.scrypt(
        password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64
    ).hex()
    assert verify_password(password, legacy_hash, salt, "scrypt-node-v1")
    assert not verify_password(password, legacy_hash, salt, "unrecognized")


@pytest.mark.parametrize("password", ["short", "x" * 257])
def test_password_limits(password):
    with pytest.raises(ValueError):
        hash_password(password)


def test_csrf_is_bound_to_a_session():
    assert csrf_for("first") != csrf_for("second")
    assert csrf_for("first") == csrf_for("first")


def test_configuration_rejects_unsafe_transport_and_urls():
    with pytest.raises(ValueError):
        Settings(database_url="sqlite:///data.db")
    with pytest.raises(ValueError):
        Settings(database_ssl_mode="no-verify")
    with pytest.raises(ValueError):
        Settings(app_url="http://example.com", environment="production")
    with pytest.raises(ValueError):
        Settings(app_url="https://user:pass@example.com")
    with pytest.raises(ValueError):
        Settings(mail_enabled=True)


def test_health_does_not_imply_readiness_and_setup_has_no_default_account():
    app = create_app(
        Settings(
            database_url="", app_url="http://testserver", environment="test", mail_enabled=False
        )
    )
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}
        assert client.get("/ready").status_code == 503
        page = client.get("/")
        assert page.status_code == 200 and "activación pendiente" in page.text
        assert "admin2026" not in page.text and "postgresql://" not in page.text
        assert "script-src 'self'" in page.headers["content-security-policy"]
        assert client.get("/static/js/main.js").status_code == 200
        assert client.get("/static/js/does-not-exist.js").status_code == 404
