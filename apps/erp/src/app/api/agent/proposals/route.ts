import { NextResponse } from "next/server";
import { sql } from "@/db";
import { agentActor, BffError } from "@/lib/agent/bff";
import { listProposals } from "@/lib/agent/proposals";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
/** The session user's recent Agent proposals with live outcome of applied effects (Perlu perhatian follow-ups). */
export async function GET() {
  try {
    const actor = await agentActor();
    return NextResponse.json(await listProposals(sql, actor), { headers });
  } catch (error) {
    if (error instanceof BffError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("agent_proposals_list_failed");
    return NextResponse.json({ error: "Tindak lanjut belum dapat dimuat." }, { status: 503, headers });
  }
}
