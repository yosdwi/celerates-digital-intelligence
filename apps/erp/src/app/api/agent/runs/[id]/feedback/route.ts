// Answer feedback (ADR-015): the session user's judgement of their own Agent answer → Intelligence, under their
// delegation. An observation for quality measurement; it changes nothing in ERP.
import { NextRequest, NextResponse } from "next/server";
import { agentActor, agentEnabled, assertSameOrigin, BffError, delegate, intelligenceBase } from "@/lib/agent/bff";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS = ["wrong", "incomplete", "irrelevant", "other"];
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    if (!UUID.test(id)) throw new BffError(404, "Run tidak ditemukan.");
    const actor = await agentActor();
    const base = intelligenceBase();
    if (!agentEnabled() || !base) throw new BffError(503, "Agent belum dikonfigurasi.");
    const raw = await request.text();
    if (raw.length > 4096) throw new BffError(413, "Umpan balik terlalu panjang.");
    let input: { rating?: unknown; reason?: unknown; comment?: unknown };
    try { input = JSON.parse(raw); } catch { throw new BffError(422, "JSON tidak valid."); }
    if (input.rating !== 1 && input.rating !== -1) throw new BffError(422, "Penilaian tidak valid.");
    const body = {
      rating: input.rating,
      reason: input.rating === -1 && typeof input.reason === "string" && REASONS.includes(input.reason) ? input.reason : null,
      comment: typeof input.comment === "string" && input.comment.trim() ? input.comment.trim().slice(0, 1000) : null,
    };
    const upstream = await fetch(`${base}/api/agent/runs/${id.toLowerCase()}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ERP-Delegation": delegate(actor, { path: "/", module: "general", entity: null }) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    }).catch(() => null);
    if (!upstream?.ok) throw new BffError(upstream?.status === 404 ? 404 : 502, "Umpan balik belum dapat disimpan.");
    return NextResponse.json({ recorded: true, rating: body.rating }, { headers });
  } catch (error) {
    if (error instanceof BffError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("agent_feedback_failed");
    return NextResponse.json({ error: "Umpan balik belum dapat disimpan." }, { status: 503, headers });
  }
}
