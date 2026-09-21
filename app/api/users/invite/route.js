import { NextResponse } from "next/server";
import crypto from "crypto";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/notifications";

const TEMP_PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generateTempPassword() {
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += TEMP_PASSWORD_CHARS[crypto.randomInt(TEMP_PASSWORD_CHARS.length)];
  }
  return out;
}

function slugifyUsername(base) {
  const slug = String(base)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._-]/g, "");
  return slug.slice(0, 30) || "usuario";
}

function nameFromEmail(email) {
  const local = email.split("@")[0];
  const words = local
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1));
  return words.join(" ") || local;
}

async function uniqueUsername(pool, base) {
  let candidate = base;
  let suffix = 1;
  while (true) {
    const { rows } = await pool.query("SELECT id FROM users WHERE username = $1", [candidate]);
    if (!rows.length) return candidate;
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
}

export async function POST(req) {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { lines, department, role } = await req.json().catch(() => ({}));
  if (!Array.isArray(lines) || !lines.length) {
    return NextResponse.json({ error: "Añade al menos un correo" }, { status: 400 });
  }
  if (!["worker", "manager", "admin"].includes(role)) {
    return NextResponse.json({ error: "Rol no válido" }, { status: 400 });
  }

  const pool = getPool();
  const created = [];
  const skipped = [];
  const failed = [];

  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line) continue;

    const parts = line
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const email = (parts.length > 1 ? parts[1] : parts[0] || "").toLowerCase();
    const name = parts.length > 1 ? parts[0] : nameFromEmail(email);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      failed.push({ line, error: "Correo no válido" });
      continue;
    }

    const { rows: existing } = await pool.query("SELECT id FROM users WHERE lower(email) = $1", [
      email,
    ]);
    if (existing.length) {
      skipped.push(email);
      continue;
    }

    const username = await uniqueUsername(pool, slugifyUsername(email.split("@")[0]));
    const tempPassword = generateTempPassword();
    const { hash, salt } = hashPassword(tempPassword);
    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO users (id, name, email, username, password_hash, password_salt, department, role, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,
      [id, name, email, username, hash, salt, department || null, role]
    );

    const sent = await sendInviteEmail({ name, email, username, tempPassword });
    created.push({ name, email, username, mailSent: sent.ok !== false && !sent.skipped });
  }

  return NextResponse.json({ created, skipped, failed });
}
