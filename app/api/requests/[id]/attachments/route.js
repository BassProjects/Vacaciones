import { NextResponse } from "next/server";
import crypto from "crypto";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canAccessRequest } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const MAX_SIZE_BYTES = 8 * 1024 * 1024;

function rowToAttachment(row) {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  };
}

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
    "SELECT id, filename, mime_type, size_bytes, uploaded_by, uploaded_at FROM request_attachments WHERE request_id = $1 ORDER BY uploaded_at ASC",
    [params.id]
  );

  return NextResponse.json({ attachments: attachmentRows.map(rowToAttachment) });
}

export async function POST(req, { params }) {
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
  if (request.type !== "baja") {
    return NextResponse.json(
      { error: "Solo se pueden adjuntar justificantes en solicitudes de baja por enfermedad" },
      { status: 400 }
    );
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Selecciona un archivo" }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Solo se admiten imágenes (JPG, PNG, WEBP, GIF) o PDF" },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "El archivo no puede superar 8 MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO request_attachments (id, request_id, filename, mime_type, size_bytes, data, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, params.id, file.name || "justificante", file.type, buffer.length, buffer, me.name]
  );

  return NextResponse.json({
    id,
    filename: file.name || "justificante",
    mimeType: file.type,
    sizeBytes: buffer.length,
    uploadedBy: me.name,
    uploadedAt: new Date().toISOString(),
  });
}
