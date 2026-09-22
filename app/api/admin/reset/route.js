import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const CONFIRM_PHRASE = "BORRAR TODO";

export async function POST(req) {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { confirm } = await req.json().catch(() => ({}));
  if (confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `Escribe exactamente "${CONFIRM_PHRASE}" para confirmar` },
      { status: 400 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount: requestsDeleted } = await client.query("DELETE FROM requests");
    const { rowCount: usersDeleted } = await client.query(
      "DELETE FROM users WHERE role <> 'admin'"
    );
    const { rowCount: holidaysDeleted } = await client.query("DELETE FROM holidays");
    await client.query("UPDATE app_config SET default_allowance = 22.5 WHERE id = 1");
    await client.query("COMMIT");
    return NextResponse.json({ requestsDeleted, usersDeleted, holidaysDeleted });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
