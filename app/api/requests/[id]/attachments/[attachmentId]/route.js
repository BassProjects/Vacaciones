import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canAccessRequest } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM requests WHERE id = $1", [params.id]);
  const request = rows[0];
  if (!request) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  if (!canAccessRequest(me, request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { rows: attachmentRows } = await pool.query(
    "SELECT * FROM request_attachments WHERE id = $1 AND request_id = $2",
    [params.attachmentId, params.id]
  );
  const attachment = attachmentRows[0];
  if (!attachment) {
    return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
  }

  return new NextResponse(attachment.data, {
    headers: {
      "Content-Type": attachment.mime_type,
      "Content-Disposition": `inline; filename="${attachment.filename.replace(/"/g, "")}"`,
    },
  });
}
