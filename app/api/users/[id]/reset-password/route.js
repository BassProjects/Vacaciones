import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { hashPassword } from "@/lib/auth";

export async function POST(req, { params }) {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { newPassword } = await req.json().catch(() => ({}));
  if (!newPassword || String(newPassword).length < 6) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 6 caracteres" },
      { status: 400 }
    );
  }

  const pool = getPool();
  const { rows } = await pool.query("SELECT id FROM users WHERE id = $1", [params.id]);
  if (!rows.length) {
    return NextResponse.json({ error: "Trabajador no encontrado" }, { status: 404 });
  }

  const { hash, salt } = hashPassword(newPassword);
  await pool.query(
    "UPDATE users SET password_hash = $1, password_salt = $2 WHERE id = $3",
    [hash, salt, params.id]
  );

  return NextResponse.json({ ok: true });
}
