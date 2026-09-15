import { NextResponse } from "next/server";
import crypto from "crypto";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { computeDays } from "@/lib/dateUtils";
import { ABSENCE_TYPES } from "@/lib/constants";

export async function POST(req) {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!me.department) {
    return NextResponse.json(
      { error: "Tu usuario no tiene un departamento asignado" },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { type, dateFrom, dateTo, halfStart, halfEnd, note } = body;

  const absenceType = ABSENCE_TYPES.find((t) => t.id === type);
  if (!absenceType) {
    return NextResponse.json({ error: "Tipo de ausencia no válido" }, { status: 400 });
  }
  if (
    !dateFrom ||
    !dateTo ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) ||
    dateTo < dateFrom
  ) {
    return NextResponse.json({ error: "Rango de fechas no válido" }, { status: 400 });
  }

  const pool = getPool();
  const years = new Set([dateFrom.slice(0, 4), dateTo.slice(0, 4)]);
  const holidaysSet = new Set();
  for (const year of years) {
    const { rows } = await pool.query("SELECT date FROM holidays WHERE date LIKE $1", [
      `${year}%`,
    ]);
    rows.forEach((r) => holidaysSet.add(r.date));
  }

  const days = computeDays(dateFrom, dateTo, !!halfStart, !!halfEnd, holidaysSet);
  if (days <= 0) {
    return NextResponse.json(
      { error: "El rango elegido no contiene días laborables" },
      { status: 400 }
    );
  }

  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO requests
       (id, user_id, user_name, department, type, date_from, date_to, half_start, half_end, days, status, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11)`,
    [
      id,
      me.id,
      me.name,
      me.department,
      type,
      dateFrom,
      dateTo,
      !!halfStart,
      !!halfEnd,
      days,
      note || null,
    ]
  );

  return NextResponse.json({ id, days });
}
