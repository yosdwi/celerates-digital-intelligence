// ADR-010: the only path by which an Agent proposal changes ERP state. Session user + same origin + stored digest.
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/db";
import { agentActor, assertSameOrigin, BffError, reportOutcome } from "@/lib/agent/bff";
import { confirmProposal, ProposalError } from "@/lib/agent/proposals";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    if (!UUID.test(id)) throw new BffError(404, "Usulan tidak ditemukan.");
    const actor = await agentActor();
    const raw = await request.text();
    if (raw.length > 262144) throw new BffError(413, "Permintaan terlalu besar.");
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new BffError(422, "JSON tidak valid."); }
    const result = await confirmProposal(sql, actor, id.toLowerCase(), body);
    await reportOutcome(actor, result);
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof BffError || error instanceof ProposalError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("agent_proposal_confirm_failed");
    return NextResponse.json({ error: "Konfirmasi belum dapat diproses. Tidak ada perubahan yang dipastikan; muat ulang usulan." }, { status: 503, headers });
  }
}
