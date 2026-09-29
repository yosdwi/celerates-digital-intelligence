import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/db";
import { agentActor, assertSameOrigin, BffError, reportOutcome } from "@/lib/agent/bff";
import { ProposalError, rejectProposal } from "@/lib/agent/proposals";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    if (!UUID.test(id)) throw new BffError(404, "Usulan tidak ditemukan.");
    const actor = await agentActor();
    const result = await rejectProposal(sql, actor, id.toLowerCase());
    await reportOutcome(actor, result);
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof BffError || error instanceof ProposalError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("agent_proposal_reject_failed");
    return NextResponse.json({ error: "Belum dapat diproses." }, { status: 503, headers });
  }
}
