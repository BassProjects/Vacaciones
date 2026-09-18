import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { notifyRequestResolved } from "@/lib/notifications";

function canApprove(me, request) {
  return (
    me.role === "admin" ||
    (me.role === "manager" &&
      me.department === request.department &&
      me.id !== request.user_id)
  );
}

const TRANSITIONS = {
  approve: { from: "pending", to: "approved" },
  reject: { from: "pending", to: "rejected" },
  cancel: { from: "approved", to: "cancelled" },
};

export async function PATCH(req, { params }) {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const { action, decisionNote } = body;
  const transition = TRANSITIONS[action];
  if (!transition) {
    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  }

  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM requests WHERE id = $1", [id]);
  const request = rows[0];
  if (!request) {
    return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  }

  if (!canApprove(me, request)) {
    return NextResponse.json(
      { error: "No tienes permiso para resolver esta solicitud" },
      { status: 403 }
    );
  }

  if (request.status !== transition.from) {
    return NextResponse.json(
      { error: `La solicitud ya no está en estado '${transition.from}'` },
      { status: 409 }
    );
  }

  const { rows: updatedRows } = await pool.query(
    `UPDATE requests
     SET status = $1, resolved_at = now(), resolved_by = $2, decision_note = $3
     WHERE id = $4 AND status = $5
     RETURNING *`,
    [transition.to, me.name, decisionNote || null, id, transition.from]
  );

  if (!updatedRows.length) {
    return NextResponse.json(
      { error: "La solicitud cambió de estado, recarga e inténtalo de nuevo" },
      { status: 409 }
    );
  }

  const updated = updatedRows[0];

  const { rows: userRows } = await pool.query("SELECT * FROM users WHERE id = $1", [
    updated.user_id,
  ]);
  const worker = userRows[0];
  await notifyRequestResolved(pool, updated, worker, me.name, me.id);

  return NextResponse.json({ ok: true });
}
