import { Pool } from "pg";
import crypto from "crypto";
import { hashPassword } from "./auth";
import { DEFAULT_HOLIDAYS_2026 } from "./constants";

let pool;
let schemaReadyPromise;

function connectionString() {
  return (
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

export function getPool() {
  if (!pool) {
    const cs = connectionString();
    pool = new Pool({
      connectionString: cs,
      ssl: cs && cs.includes("localhost") ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export function ensureSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = runEnsureSchema().catch((err) => {
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

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
    INSERT INTO app_config (id, default_allowance)
    VALUES (1, 22.5)
    ON CONFLICT (id) DO NOTHING;
  `);

  const { rows: adminRows } = await p.query(
    "SELECT id FROM users WHERE username = $1",
    ["admin"]
  );
  if (!adminRows.length) {
    const { hash, salt } = hashPassword("admin2026");
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
