import { NextRequest, NextResponse } from "next/server";
import { agentActor, agentEnabled, BffError, pageContext } from "@/lib/agent/bff";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
/** Page/entity context for the Agent panel header and suggestions. Read-only; no Intelligence call. */
export async function GET(request: NextRequest) {
  try {
    const actor = await agentActor();
    const result = await pageContext(actor, request.nextUrl.searchParams.get("path") || "/");
    return NextResponse.json({ version: 1, enabled: agentEnabled(), ...result }, { headers });
  } catch (error) {
    if (error instanceof BffError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("agent_context_failed");
    return NextResponse.json({ error: "Konteks belum dapat dimuat." }, { status: 503, headers });
  }
}
