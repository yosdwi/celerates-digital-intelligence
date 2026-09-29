import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requirePilotActor } from "@/lib/actor";
import { sql } from "@/db";
import { readOperationalContext, signalTrends } from "@/lib/operations/reader";
import type { OperationalActor } from "@/lib/operations/policy";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  try {
    await requirePilotActor();
  } catch {
    return NextResponse.json(
      { error: "Akses tidak tersedia." },
      { status: 403, headers },
    );
  }
  try {
    const session = await getServerSession(authOptions);
    const result = await readOperationalContext(
      sql,
      session?.user as OperationalActor,
      request.nextUrl.searchParams.get("path"),
    );
    // What changed since the last day observed (observation). Never allowed to break the panel.
    const trends = await signalTrends(sql, result.groups).catch(() => {
      console.error("operational_trends_failed");
      return {};
    });
    return NextResponse.json({ ...result, trends }, { headers });
  } catch {
    console.error("operational_context_read_failed");
    return NextResponse.json(
      { error: "Ringkasan belum dapat dimuat. Coba lagi." },
      { status: 503, headers },
    );
  }
}
