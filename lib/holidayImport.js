import * as XLSX from "xlsx";

function normalizeDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Fecha serial de Excel (días desde 1899-12-30)
    const epochMs = Date.UTC(1899, 11, 30);
    return normalizeDateValue(new Date(epochMs + value * 86400000));
  }

  const str = String(value ?? "").trim();
  if (!str) return null;

  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  m = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;

  return null;
}

// Espera una hoja con la fecha en la primera columna y el nombre del
// festivo en la segunda (con o sin fila de cabecera; las filas que no
// contienen una fecha reconocible, como la cabecera, se descartan solas).
export function parseSpreadsheet(buffer, { isCsv = false } = {}) {
  // Los .xlsx/.xls llevan su propia codificación interna, pero un CSV es
  // texto plano: hay que decodificarlo como UTF-8 explícitamente o SheetJS
  // puede interpretar mal los acentos y la ñ.
  const workbook = isCsv
    ? XLSX.read(buffer.toString("utf8"), { type: "string", cellDates: true })
    : XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });

  const results = [];
  for (const row of rows) {
    if (!row || !row.length) continue;
    const [colA, colB] = row;
    const date = normalizeDateValue(colA);
    const name = String(colB ?? "").trim();
    if (date && name) results.push({ date, name });
  }
  return results;
}

const PDF_DATE_REGEX = /(\d{4}-\d{1,2}-\d{1,2})|(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4})/;

export async function parsePdfHolidays(buffer) {
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const data = await pdfParse(buffer);
  const lines = data.text.split(/\r?\n/);

  const results = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(PDF_DATE_REGEX);
    if (!match) continue;
    const date = normalizeDateValue(match[0]);
    if (!date) continue;
    const name = line
      .replace(match[0], "")
      .replace(/^[\s:,\-–—]+|[\s:,\-–—]+$/g, "")
      .trim();
    if (name) results.push({ date, name });
  }
  return results;
}
