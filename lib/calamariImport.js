import * as XLSX from "xlsx";

const TYPE_KEYWORDS = [
  { type: "vacaciones", test: (s) => s.includes("vacacion") },
  { type: "baja", test: (s) => s.includes("baja") },
  { type: "ausencia", test: (s) => s.includes("ausencia") },
  { type: "permiso", test: (s) => s.includes("permiso") },
];

function matchType(label) {
  const s = String(label || "").toLowerCase();
  const found = TYPE_KEYWORDS.find((k) => k.test(s));
  return found ? found.type : null;
}

function parseHeaderDate(value) {
  const m = String(value || "")
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function parseDurationToHours(value) {
  if (typeof value === "number") return value;
  const str = String(value ?? "").trim();
  if (!str) return 0;
  let hours = 0;
  let matched = false;
  const hMatch = str.match(/(\d+(?:[.,]\d+)?)\s*h/i);
  const mMatch = str.match(/(\d+)\s*m/i);
  if (hMatch) {
    hours += parseFloat(hMatch[1].replace(",", "."));
    matched = true;
  }
  if (mMatch) {
    hours += parseInt(mMatch[1], 10) / 60;
    matched = true;
  }
  if (!matched) {
    const n = parseFloat(str.replace(",", "."));
    if (!Number.isNaN(n)) hours = n;
  }
  return hours;
}

function isWeekendIso(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

// Analiza una exportación "Detailed timesheet" de Calamari (hoja numérica
// preferida si existe) y devuelve tramos de ausencia por persona/tipo,
// agrupando días consecutivos (permitiendo puentes de fin de semana) tal
// como los habría introducido la propia persona en una única solicitud.
export function parseCalamariWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const numSheetName = workbook.SheetNames.find((n) => /num/i.test(n));
  const sheetName = numSheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const isNumericSheet = Boolean(numSheetName);
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: isNumericSheet,
    defval: "",
  });

  if (!rows.length) return { periods: [] };

  const header = rows[0] || [];
  const dateCols = [];
  for (let c = 5; c < header.length; c++) {
    const iso = parseHeaderDate(header[c]);
    if (iso) dateCols.push({ col: c, date: iso });
  }

  const periods = [];
  const nameByEmail = new Map();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.length) continue;
    const name = String(row[0] || "").trim();
    const surname = String(row[1] || "").trim();
    const email = String(row[3] || "")
      .trim()
      .toLowerCase();
    const rowLabel = String(row[4] || "").trim();
    if (!email) continue;

    const fullName = `${name} ${surname}`.trim();
    if (fullName) nameByEmail.set(email, fullName);

    const type = matchType(rowLabel);
    if (!type) continue;

    const dayValues = dateCols.map(({ col, date }) => ({
      date,
      hours: parseDurationToHours(row[col]),
    }));

    let current = null;
    const flush = () => {
      if (current) periods.push(current);
      current = null;
    };
    for (const { date, hours } of dayValues) {
      const active = hours > 0;
      if (active) {
        if (!current) {
          current = {
            email,
            name: fullName,
            type,
            dateFrom: date,
            dateTo: date,
            totalHours: 0,
            firstHours: hours,
            lastHours: hours,
          };
        }
        current.dateTo = date;
        current.lastHours = hours;
        current.totalHours += hours;
      } else if (isWeekendIso(date) && current) {
        // Puente de fin de semana dentro de un mismo tramo: no lo cierra.
        continue;
      } else {
        flush();
      }
    }
    flush();
  }

  const result = periods.map((p) => {
    const isSingleDay = p.dateFrom === p.dateTo;
    const firstIsHalf = p.firstHours >= 3 && p.firstHours <= 5;
    const lastIsHalf = p.lastHours >= 3 && p.lastHours <= 5;
    return {
      email: p.email,
      name: p.name,
      type: p.type,
      dateFrom: p.dateFrom,
      dateTo: p.dateTo,
      days: Math.round((p.totalHours / 8) * 100) / 100,
      halfStart: isSingleDay ? firstIsHalf || lastIsHalf : firstIsHalf,
      halfEnd: isSingleDay ? false : lastIsHalf,
    };
  });

  return { periods: result };
}
