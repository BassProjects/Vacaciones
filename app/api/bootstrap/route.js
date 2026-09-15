import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser, rowToUser } from "@/lib/session";
import { DEPARTMENTS, ABSENCE_TYPES } from "@/lib/constants";

export const dynamic = "force-dynamic";

function rowToRequest(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    department: row.department,
    type: row.type,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    halfStart: row.half_start,
    halfEnd: row.half_end,
    days: Number(row.days),
    status: row.status,
    note: row.note,
    requestedAt: row.requested_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    decisionNote: row.decision_note,
  };
}

export async function GET() {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const pool = getPool();

  const { rows: configRows } = await pool.query(
    "SELECT * FROM app_config WHERE id = 1"
  );
  const defaultAllowance = Number(configRows[0]?.default_allowance ?? 22.5);

  const { rows: holidayRows } = await pool.query(
    "SELECT * FROM holidays ORDER BY date ASC"
  );
  const holidays = holidayRows.map((h) => ({ date: h.date, name: h.name }));

  let requestRows;
  if (me.role === "admin") {
    const { rows } = await pool.query(
      "SELECT * FROM requests ORDER BY requested_at DESC LIMIT 1000"
    );
    requestRows = rows;
  } else if (me.role === "manager") {
    const { rows } = await pool.query(
      `SELECT * FROM requests
       WHERE user_id = $1 OR department = $2 OR status = 'approved'
       ORDER BY requested_at DESC LIMIT 1000`,
      [me.id, me.department]
    );
    requestRows = rows;
  } else {
    const { rows } = await pool.query(
      `SELECT * FROM requests
       WHERE user_id = $1 OR status = 'approved'
       ORDER BY requested_at DESC LIMIT 1000`,
      [me.id]
    );
    requestRows = rows;
  }
  const requests = requestRows.map(rowToRequest);

  let users = [];
  if (me.role === "admin") {
    const { rows } = await pool.query("SELECT * FROM users ORDER BY name ASC");
    users = rows.map(rowToUser);
  }

  return NextResponse.json({
    me,
    config: { defaultAllowance },
    departments: DEPARTMENTS,
    absenceTypes: ABSENCE_TYPES,
    holidays,
    requests,
    users,
  });
}
