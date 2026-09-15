import { cookies } from "next/headers";
import { verifySessionToken, SESSION_COOKIE_NAME } from "./auth";
import { getPool } from "./db";

export function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email || "",
    username: row.username,
    department: row.department,
    role: row.role,
    allowanceOverride:
      row.allowance_override != null ? Number(row.allowance_override) : null,
    active: row.active,
    createdAt: row.created_at,
  };
}

export async function getCurrentUser() {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const userId = verifySessionToken(token);
  if (!userId) return null;
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE id = $1 AND active = TRUE",
    [userId]
  );
  if (!rows.length) return null;
  return rowToUser(rows[0]);
}
