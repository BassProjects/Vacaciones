import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function DELETE(req, { params }) {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const pool = getPool();
  await pool.query("DELETE FROM holidays WHERE date = $1", [
    decodeURIComponent(params.id),
  ]);

  return NextResponse.json({ ok: true });
}
