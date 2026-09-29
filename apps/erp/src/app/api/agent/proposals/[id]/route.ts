import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/db";
import { agentActor, BffError } from "@/lib/agent/bff";
import { getProposal, ProposalError } from "@/lib/agent/proposals";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The ERP-held proposal exactly as stored; the Agent panel renders previews only from this. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) throw new BffError(404, "Usulan tidak ditemukan.");
    const actor = await agentActor();
    return NextResponse.json(await getProposal(sql, actor, id.toLowerCase()), { headers });
  } catch (error) {
    if (error instanceof BffError || error instanceof ProposalError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("agent_proposal_read_failed");
    return NextResponse.json({ error: "Usulan belum dapat dimuat." }, { status: 503, headers });
  }
}
