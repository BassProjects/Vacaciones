import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import {
  verifyPassword,
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";
import { rowToUser } from "@/lib/session";

export async function POST(req) {
  await ensureSchema();
  const body = await req.json().catch(() => ({}));
  const { username, password } = body;

  if (!username || !password) {
    return NextResponse.json(
      { error: "Usuario y contraseña son obligatorios" },
      { status: 400 }
    );
  }

  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [
    String(username).trim(),
  ]);
  const user = rows[0];

  if (!user || !user.active) {
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos" },
      { status: 401 }
    );
  }

  const valid = verifyPassword(password, user.password_salt, user.password_hash);
  if (!valid) {
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos" },
      { status: 401 }
    );
  }

  const token = createSessionToken(user.id);
  const res = NextResponse.json({ user: rowToUser(user) });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  return res;
}
