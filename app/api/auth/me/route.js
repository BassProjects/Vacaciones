import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();
  const user = await getCurrentUser();
  return NextResponse.json({ user: user || null });
}
