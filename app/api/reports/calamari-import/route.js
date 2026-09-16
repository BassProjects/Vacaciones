import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseCalamariWorkbook } from "@/lib/calamariImport";

export const dynamic = "force-dynamic";

// Analiza una exportación "Detailed timesheet" de Calamari y devuelve una
// previsualización (emparejando cada fila con un trabajador existente por
// correo) sin guardar nada todavía: la confirmación va en
// /api/reports/calamari-import/confirm.
export async function POST(req) {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Selecciona un archivo" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = parseCalamariWorkbook(buffer);
  } catch (err) {
    console.error("Error al procesar el histórico de Calamari:", err);
    return NextResponse.json(
      {
        error:
          "No se ha podido leer el archivo. Comprueba que sea una exportación 'Detailed timesheet' de Calamari.",
      },
      { status: 400 }
    );
  }

  if (!parsed.periods.length) {
    return NextResponse.json(
      {
        error:
          "No se han encontrado ausencias reconocibles (Vacaciones, Baja, Días de permiso o Ausencia temporal) en el archivo.",
      },
      { status: 400 }
    );
  }

  const pool = getPool();
  const { rows: userRows } = await pool.query(
    "SELECT id, name, email, department FROM users"
  );
  const byEmail = new Map(
    userRows.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u])
  );

  const periods = parsed.periods.map((p) => {
    const match = byEmail.get(p.email);
    return {
      ...p,
      matchedUserId: match ? match.id : null,
      matchedUserName: match ? match.name : null,
      department: match ? match.department : null,
    };
  });

  periods.sort(
    (a, b) =>
      (a.matchedUserName || a.name).localeCompare(b.matchedUserName || b.name) ||
      a.dateFrom.localeCompare(b.dateFrom)
  );

  return NextResponse.json({ periods });
}
