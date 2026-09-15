import { NextResponse } from "next/server";
import crypto from "crypto";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { hashPassword } from "@/lib/auth";

export async function POST(req) {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { name, email, username, password, department, role, allowanceOverride, birthDate } =
    await req.json().catch(() => ({}));

  if (!name || !username || !password) {
    return NextResponse.json(
      { error: "Nombre, usuario y contraseña son obligatorios" },
      { status: 400 }
    );
  }
  if (String(password).length < 6) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 6 caracteres" },
      { status: 400 }
    );
  }
  if (!["worker", "manager", "admin"].includes(role)) {
    return NextResponse.json({ error: "Rol no válido" }, { status: 400 });
  }
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return NextResponse.json(
      { error: "La fecha de nacimiento es obligatoria" },
      { status: 400 }
    );
  }

  const pool = getPool();
  const { rows: existing } = await pool.query(
    "SELECT id FROM users WHERE username = $1",
    [String(username).trim()]
  );
  if (existing.length) {
    return NextResponse.json({ error: "Ese nombre de usuario ya existe" }, { status: 409 });
  }

  const { hash, salt } = hashPassword(password);
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO users
       (id, name, email, username, password_hash, password_salt, department, role, allowance_override, birth_date, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE)`,
    [
      id,
      name,
      email || null,
      String(username).trim(),
      hash,
      salt,
      department || null,
      role,
      allowanceOverride === "" || allowanceOverride == null ? null : Number(allowanceOverride),
      birthDate,
    ]
  );

  return NextResponse.json({ id });
}
