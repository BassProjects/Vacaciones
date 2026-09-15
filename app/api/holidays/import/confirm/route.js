import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function POST(req) {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { holidays } = await req.json().catch(() => ({}));
  if (!Array.isArray(holidays) || !holidays.length) {
    return NextResponse.json({ error: "No hay festivos que importar" }, { status: 400 });
  }

  const pool = getPool();
  let imported = 0;
  for (const h of holidays) {
    if (!h || !/^\d{4}-\d{2}-\d{2}$/.test(h.date)) continue;
    const name = String(h.name || "").trim().slice(0, 200);
    if (!name) continue;
    await pool.query(
      `INSERT INTO holidays (date, name) VALUES ($1, $2)
       ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name`,
      [h.date, name]
    );
    imported += 1;
  }

  if (!imported) {
    return NextResponse.json({ error: "No se ha importado ningún festivo válido" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, imported });
}
