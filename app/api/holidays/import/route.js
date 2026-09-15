import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseSpreadsheet, parsePdfHolidays } from "@/lib/holidayImport";

export const dynamic = "force-dynamic";

// Analiza un Excel/CSV/PDF de festivos y devuelve una previsualización sin
// guardar nada todavía: la confirmación final va en /api/holidays/import/confirm.
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
  const fileName = (file.name || "").toLowerCase();

  let holidays = [];
  try {
    if (fileName.endsWith(".pdf")) {
      holidays = await parsePdfHolidays(buffer);
    } else if (
      fileName.endsWith(".xlsx") ||
      fileName.endsWith(".xls") ||
      fileName.endsWith(".csv")
    ) {
      holidays = parseSpreadsheet(buffer, { isCsv: fileName.endsWith(".csv") });
    } else {
      return NextResponse.json(
        { error: "Formato no soportado. Usa un Excel (.xlsx/.xls), CSV o PDF." },
        { status: 400 }
      );
    }
  } catch (err) {
    console.error("Error al procesar el archivo de festivos:", err);
    return NextResponse.json(
      { error: "No se ha podido leer el archivo. Revisa que el formato sea correcto." },
      { status: 400 }
    );
  }

  if (!holidays.length) {
    return NextResponse.json(
      {
        error:
          "No se ha reconocido ningún festivo en el archivo. Comprueba que tenga una columna de fecha y otra de nombre (Excel) o líneas con fecha + texto (PDF).",
      },
      { status: 400 }
    );
  }

  const seen = new Set();
  const deduped = [];
  for (const h of holidays) {
    if (seen.has(h.date)) continue;
    seen.add(h.date);
    deduped.push(h);
  }
  deduped.sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ holidays: deduped });
}
