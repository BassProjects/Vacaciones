import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  // Liveness deliberately does not depend on PostgreSQL or email.
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
