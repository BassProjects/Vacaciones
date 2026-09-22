import { Pool } from "pg";
import crypto from "crypto";
import { hashPassword } from "./auth";
import { DEFAULT_HOLIDAYS_2026 } from "./constants";
import runtimeConfig from "./runtimeConfig.cjs";

let pool;
let schemaReadyPromise;

export function getPool() {
  if (!pool) pool = new Pool(runtimeConfig.databaseOptions());
  return pool;
}

// Dokploy never creates tables, users or holidays from an HTTP request.
// Validate the restored schema without returning employee data.
export async function checkExistingSchema() {
  const p = getPool();
  await p.query("SELECT id, default_allowance FROM app_config LIMIT 0");
  await p.query("SELECT id, name, email, username, password_hash, password_salt, department, role, allowance_override, active, birth_date, created_at FROM users LIMIT 0");
  await p.query("SELECT id, user_id, user_name, department, type, date_from, date_to, half_start, half_end, days, status, note, requested_at, resolved_at, resolved_by, decision_note FROM requests LIMIT 0");
  await p.query("SELECT date, name FROM holidays LIMIT 0");
  await p.query("SELECT id, request_id, filename, mime_type, size_bytes, data, uploaded_by, uploaded_at FROM request_attachments LIMIT 0");
  const { rows } = await p.query("SELECT EXISTS(SELECT 1 FROM app_config WHERE id = 1) AS configured, EXISTS(SELECT 1 FROM users WHERE role = 'admin' AND active = TRUE) AS has_admin");
  if (!rows[0]?.configured || !rows[0]?.has_admin) {
    throw new Error("The restored database requires configuration and an active administrator");
  }
}

export function ensureSchema() {
  if (!schemaReadyPromise) {
    const check = process.env.SCHEMA_MANAGEMENT === "external" ? checkExistingSchema : runEnsureSchema;
    schemaReadyPromise = check().catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  return schemaReadyPromise;
}

async function runEnsureSchema() {
  const p = getPool();

  await p.query(`
    CREATE TABLE IF NOT EXISTS app_config (
      id INT PRIMARY KEY DEFAULT 1,
      default_allowance NUMERIC NOT NULL DEFAULT 22.5
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      department TEXT,
      role TEXT NOT NULL DEFAULT 'worker',
      allowance_override NUMERIC,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      birth_date TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Migración segura para bases de datos ya existentes creadas antes de
  // añadir la fecha de nacimiento.
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date TEXT;`);

  await p.query(`
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      user_name TEXT NOT NULL,
      department TEXT NOT NULL,
      type TEXT NOT NULL,
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      half_start BOOLEAN NOT NULL DEFAULT FALSE,
      half_end BOOLEAN NOT NULL DEFAULT FALSE,
      days NUMERIC NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ,
      resolved_by TEXT,
      decision_note TEXT
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS holidays (
      date TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS request_attachments (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INT NOT NULL,
      data BYTEA NOT NULL,
      uploaded_by TEXT NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await p.query(`
    INSERT INTO app_config (id, default_allowance)
    VALUES (1, 22.5)
    ON CONFLICT (id) DO NOTHING;
  `);

  const { rows: adminRows } = await p.query(
    "SELECT id FROM users WHERE username = $1",
    ["admin"]
  );
  if (!adminRows.length) {
    const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (typeof bootstrapPassword !== "string" || bootstrapPassword.length < 16) {
      throw new Error("An explicit BOOTSTRAP_ADMIN_PASSWORD of at least 16 characters is required for legacy initialization");
    }
    const { hash, salt } = hashPassword(bootstrapPassword);
    await p.query(
      `INSERT INTO users (id, name, email, username, password_hash, password_salt, department, role, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)`,
      [crypto.randomUUID(), "Administrador", "", "admin", hash, salt, null, "admin"]
    );
  }

  const { rows: holidayCount } = await p.query(
    "SELECT COUNT(*)::int AS c FROM holidays"
  );
  if (holidayCount[0].c === 0) {
    for (const h of DEFAULT_HOLIDAYS_2026) {
      await p.query(
        "INSERT INTO holidays (date, name) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [h.date, h.name]
      );
    }
  }
}
