import { NextResponse } from "next/server";
import { ensureSchema, getPool } from "@/lib/db";
import runtimeConfig from "@/lib/runtimeConfig.cjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let timer;
  try {
    runtimeConfig.validateDeploymentEnvironment();
    await Promise.race([
      (async () => {
        await ensureSchema();
        await getPool().query("SELECT 1");
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Readiness timeout")), 4500);
      }),
    ]);
    return NextResponse.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Do not expose connection details, schema names or employee information.
    return NextResponse.json({ status: "not_ready" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  } finally {
    clearTimeout(timer);
  }
}
