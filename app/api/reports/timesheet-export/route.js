import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { daysInMonth } from "@/lib/dateUtils";
import { DEPARTMENTS } from "@/lib/constants";

export const dynamic = "force-dynamic";

const ROW_DEFS = [
  { key: "planned", label: "Planned work time" },
  { key: "holidays", label: "Holidays" },
  { key: "ausencia", label: "Ausencia Temporal", type: "ausencia" },
  { key: "vacaciones", label: "Vacaciones", type: "vacaciones" },
  { key: "baja", label: "Baja por enfermedad", type: "baja" },
  { key: "permiso", label: "Días de permiso (M/Paternidad, Mudanza, etc)", type: "permiso" },
  { key: "allAbsences", label: "All absences" },
];

function fmtHoursCell(hours) {
  if (!hours) return "0h";
  if (Number.isInteger(hours)) return `${hours}h`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isWeekend(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

export async function GET(req) {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const ym = searchParams.get("ym") || "";
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  if (!m) {
    return NextResponse.json({ error: "Selecciona un mes válido" }, { status: 400 });
  }
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  const userId = searchParams.get("userId") || "all";

  const pool = getPool();
  const { rows: allUsers } = await pool.query(
    "SELECT id, name, email, department FROM users WHERE active = TRUE ORDER BY name ASC"
  );
  const users = userId === "all" ? allUsers : allUsers.filter((u) => u.id === userId);
  if (!users.length) {
    return NextResponse.json({ error: "No se ha encontrado al trabajador" }, { status: 404 });
  }

  const monthStr = String(month).padStart(2, "0");
  const totalDays = daysInMonth(year, month - 1);
  const dates = [];
  for (let d = 1; d <= totalDays; d++) {
    dates.push(`${year}-${monthStr}-${String(d).padStart(2, "0")}`);
  }

  const { rows: holidayRows } = await pool.query(
    "SELECT date FROM holidays WHERE date LIKE $1",
    [`${year}-${monthStr}%`]
  );
  const holidaySet = new Set(holidayRows.map((h) => h.date));

  const { rows: requestRows } = await pool.query(
    `SELECT * FROM requests
     WHERE status = 'approved' AND date_from <= $2 AND date_to >= $1`,
    [dates[0], dates[dates.length - 1]]
  );

  const header = [
    "Nombre",
    "Apellido",
    "Equipos",
    "E-mail",
    "",
    ...dates.map((d) => {
      const [, mm, dd] = d.split("-");
      return `${dd}/${mm}/${year}`;
    }),
    "Suma",
  ];

  const departmentNameById = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d.name]));
  const sheetRows = [header];

  for (const u of users) {
    const [firstName, ...rest] = u.name.split(" ");
    const lastName = rest.join(" ");
    const userRequests = requestRows.filter((r) => r.user_id === u.id);

    const rowValues = {};
    for (const def of ROW_DEFS) rowValues[def.key] = dates.map(() => 0);

    dates.forEach((iso, i) => {
      const weekend = isWeekend(iso);
      rowValues.planned[i] = weekend ? 0 : 8;
      if (!weekend && holidaySet.has(iso)) rowValues.holidays[i] = 8;
    });

    for (const r of userRequests) {
      const def = ROW_DEFS.find((d) => d.type === r.type);
      if (!def) continue;
      const isSingleDay = r.date_from === r.date_to;
      dates.forEach((iso, i) => {
        if (iso < r.date_from || iso > r.date_to) return;
        if (isWeekend(iso) || holidaySet.has(iso)) return;
        let hours = 8;
        if (isSingleDay) {
          // Un tramo de un solo día puede venir de un histórico importado con
          // una fracción de jornada cualquiera (no solo día completo/medio),
          // así que usamos el valor de "days" tal cual en vez de asumir 8h/4h.
          hours = Number(r.days) * 8;
        } else {
          if (iso === r.date_from && r.half_start) hours = 4;
          if (iso === r.date_to && r.half_end) hours = 4;
        }
        rowValues[def.key][i] += hours;
      });
    }

    dates.forEach((_, i) => {
      rowValues.allAbsences[i] =
        rowValues.ausencia[i] + rowValues.vacaciones[i] + rowValues.baja[i] + rowValues.permiso[i];
    });

    for (const def of ROW_DEFS) {
      const values = rowValues[def.key];
      const sum = values.reduce((s, v) => s + v, 0);
      sheetRows.push([
        firstName,
        lastName,
        departmentNameById[u.department] || "",
        u.email || "",
        def.label,
        ...values.map(fmtHoursCell),
        fmtHoursCell(sum),
      ]);
    }
  }

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Detailed timesheet");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const safeName = (userId === "all" ? "todos" : users[0].name).replace(/[^a-zA-Z0-9_-]+/g, "_");
  const fileName = `historico_${safeName}_${year}-${monthStr}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
