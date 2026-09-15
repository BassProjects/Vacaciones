import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/auth";

export async function POST(req) {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { currentPassword, newPassword } = await req.json().catch(() => ({}));
  if (!currentPassword || !newPassword || String(newPassword).length < 6) {
    return NextResponse.json(
      { error: "La nueva contraseña debe tener al menos 6 caracteres" },
      { status: 400 }
    );
  }

  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [me.id]);
  const user = rows[0];
  if (!user || !verifyPassword(currentPassword, user.password_salt, user.password_hash)) {
    return NextResponse.json(
      { error: "La contraseña actual no es correcta" },
      { status: 400 }
    );
  }

  const { hash, salt } = hashPassword(newPassword);
  await pool.query(
    "UPDATE users SET password_hash = $1, password_salt = $2 WHERE id = $3",
    [hash, salt, me.id]
  );

  return NextResponse.json({ ok: true });
}
