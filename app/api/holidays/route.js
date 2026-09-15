import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function POST(req) {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { date, name } = await req.json().catch(() => ({}));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !name || !String(name).trim()) {
    return NextResponse.json(
      { error: "Fecha y nombre son obligatorios" },
      { status: 400 }
    );
  }

  const pool = getPool();
  await pool.query(
    `INSERT INTO holidays (date, name) VALUES ($1, $2)
     ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name`,
    [date, String(name).trim()]
  );

  return NextResponse.json({ ok: true });
}
