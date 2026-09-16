import { NextResponse } from "next/server";
import crypto from "crypto";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req) {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { periods } = await req.json().catch(() => ({}));
  if (!Array.isArray(periods) || !periods.length) {
    return NextResponse.json({ error: "No hay ausencias que importar" }, { status: 400 });
  }

  const pool = getPool();
  const { rows: userRows } = await pool.query("SELECT id, name, department FROM users");
  const byId = new Map(userRows.map((u) => [u.id, u]));

  const validTypes = new Set(["vacaciones", "ausencia", "baja", "permiso"]);
  let imported = 0;
  for (const p of periods) {
    if (!p || !p.userId || !validTypes.has(p.type)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(p.dateTo)) continue;
    const user = byId.get(p.userId);
    if (!user) continue;
    const days = Number(p.days);
    if (!Number.isFinite(days) || days <= 0) continue;

    await pool.query(
      `INSERT INTO requests
         (id, user_id, user_name, department, type, date_from, date_to, half_start, half_end, days, status, note, resolved_at, resolved_by, decision_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved',$11,now(),$12,$13)`,
      [
        crypto.randomUUID(),
        user.id,
        user.name,
        user.department,
        p.type,
        p.dateFrom,
        p.dateTo,
        !!p.halfStart,
        !!p.halfEnd,
        days,
        "Importado desde histórico de Calamari",
        me.name,
        "Registro histórico importado",
      ]
    );
    imported += 1;
  }

  if (!imported) {
    return NextResponse.json({ error: "No se ha importado ninguna ausencia válida" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, imported });
}
