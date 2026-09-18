export function parseISODate(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatISODate(date) {
  return date.toISOString().slice(0, 10);
}

// Lista los días laborables (lunes-viernes, sin festivos) entre dateFrom y
// dateTo, ambos inclusive.
export function enumerateWorkDays(dateFrom, dateTo, holidaysSet) {
  const start = parseISODate(dateFrom);
  const end = parseISODate(dateTo);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const workDays = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const dow = cursor.getUTCDay();
    const iso = formatISODate(cursor);
    if (dow !== 0 && dow !== 6 && !holidaysSet.has(iso)) {
      workDays.push(iso);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return workDays;
}

// Cuenta días laborables entre dateFrom y dateTo, ambos inclusive, y aplica
// los descuentos de medio día en los extremos.
export function computeDays(dateFrom, dateTo, halfStart, halfEnd, holidaysSet) {
  const workDays = enumerateWorkDays(dateFrom, dateTo, holidaysSet);
  if (workDays.length === 0) return 0;

  let total = workDays.length;
  if (workDays.length === 1) {
    if (halfStart || halfEnd) total -= 0.5;
  } else {
    if (halfStart) total -= 0.5;
    if (halfEnd) total -= 0.5;
  }
  return total;
}

export function daysInMonth(year, monthIndex0) {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

export const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const WEEKDAY_NAMES_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
