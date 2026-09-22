"""Pure calendar rules. Persist per-day allocations; never derive balances from UI pages."""

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

PRECISION = Decimal("0.0001")


@dataclass(frozen=True)
class DayAllocation:
    date: date
    units: Decimal
    hours: Decimal


def decimal(value):
    result = Decimal(str(value))
    if not result.is_finite():
        raise ValueError("Cantidad no finita")
    return result


def dates_between(start, end, limit=367):
    count = (end - start).days + 1
    if not 0 < count <= limit:
        raise ValueError("Rango de fechas no válido")
    return [start + timedelta(days=i) for i in range(count)]


def allocate_days(start, end, half_start=False, half_end=False, holidays=frozenset(), hours=None):
    hours = hours if hours is not None else {str(i): "8" for i in range(5)}
    days = [d for d in dates_between(start, end) if str(d.weekday()) in hours and d not in holidays]
    if not days:
        raise ValueError("El rango elegido no contiene días laborables")
    if (half_start and start not in days) or (half_end and end not in days):
        raise ValueError("El medio día debe corresponder a una fecha laborable seleccionada")
    result = []
    for day in days:
        units = (
            Decimal("0.5")
            if ((day == start and half_start) or (day == end and half_end))
            else Decimal("1")
        )
        day_hours = decimal(hours[str(day.weekday())])
        if not 0 < day_hours <= 24:
            raise ValueError("Jornada no válida")
        result.append(DayAllocation(day, units, day_hours * units))
    return result


def split_years(allocations):
    result = {}
    for row in allocations:
        result[row.date.year] = result.get(row.date.year, Decimal(0)) + row.units
    return result


def prorated_entitlement(entitlement, year, employed_from=None, employed_to=None):
    first, last = date(year, 1, 1), date(year, 12, 31)
    begin = max(first, employed_from or first)
    end = min(last, employed_to or last)
    active = max(0, (end - begin).days + 1)
    return (decimal(entitlement) * active / (366 if calendar.isleap(year) else 365)).quantize(
        PRECISION, rounding=ROUND_HALF_UP
    )


def legacy_allocation(start, end, total, half_start, half_end, holidays):
    """Preserve legacy totals exactly; flag inferred distributions in the migration report."""
    all_days = dates_between(start, end, limit=3661)
    days = [d for d in all_days if d.weekday() < 5 and d not in holidays]
    if not days:
        raise ValueError("Histórico con saldo positivo pero sin días laborables; requiere revisión")
    weights = [Decimal(1) for _ in days]
    if len(days) == 1 and (half_start or half_end):
        weights[0] = Decimal("0.5")
    elif len(days) > 1:
        if half_start:
            weights[0] = Decimal("0.5")
        if half_end:
            weights[-1] = Decimal("0.5")
    total = decimal(total)
    if total <= 0:
        raise ValueError("Saldo histórico no válido")
    weight_sum = sum(weights)
    units = [(total * w / weight_sum).quantize(PRECISION) for w in weights]
    units[-1] += total - sum(units)
    if any(v <= 0 for v in units):
        raise ValueError("No se puede distribuir el saldo histórico sin perder precisión")
    return [
        DayAllocation(d, v, v * 8) for d, v in zip(days, units, strict=True)
    ], total != weight_sum
