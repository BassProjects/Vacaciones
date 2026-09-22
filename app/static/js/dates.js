// Calendar presentation only. The Python ledger remains the source of truth.
export function parseISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return new Date(NaN);
  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));
  return result.toISOString().slice(0,10) === value ? result : new Date(NaN);
}
export function formatISODate(value) { return value.toISOString().slice(0,10); }
export function enumerateWorkDays(from, to, holidays = new Set()) {
  const start = parseISODate(from), end = parseISODate(to);
  if (Number.isNaN(+start) || Number.isNaN(+end) || end < start || end-start > 366*86400000) return [];
  const result = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate()+1)) {
    const day = formatISODate(cursor);
    if (![0,6].includes(cursor.getUTCDay()) && !holidays.has(day)) result.push(day);
  }
  return result;
}
export function computeDays(from, to, halfStart, halfEnd, holidays) {
  const days = enumerateWorkDays(from,to,holidays);
  if (!days.length || halfStart && !days.includes(from) || halfEnd && !days.includes(to)) return 0;
  return days.reduce((total, day) => total + ((day === from && halfStart || day === to && halfEnd) ? 0.5 : 1),0);
}
export function daysInMonth(year, monthIndex0) { return new Date(Date.UTC(year,monthIndex0+1,0)).getUTCDate(); }
export const MONTH_NAMES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
export const WEEKDAY_NAMES_ES = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
