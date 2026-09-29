// Send or cancel a draft the Agent prepared from the user's own free text (ADR-017): a knowledge correction or
// feedback on an earlier answer. Forwarded under the session user's delegation; Intelligence checks ownership.
// Nothing in ERP changes here: Feature Requests and data corrections are ERP-held proposals instead.
import { NextRequest, NextResponse } from "next/server";
import { agentActor, agentEnabled, assertSameOrigin, BffError, delegate, intelligenceBase } from "@/lib/agent/bff";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    if (!UUID.test(id)) throw new BffError(404, "Draf tidak ditemukan.");
    const actor = await agentActor();
    const base = intelligenceBase();
    if (!agentEnabled() || !base) throw new BffError(503, "Agent belum dikonfigurasi.");
    const raw = await request.text();
    if (raw.length > 8192) throw new BffError(413, "Draf terlalu panjang.");
    let input: { action?: unknown; title?: unknown; body?: unknown };
    try { input = JSON.parse(raw); } catch { throw new BffError(422, "JSON tidak valid."); }
    if (input.action !== "submit" && input.action !== "cancel") throw new BffError(422, "Aksi tidak valid.");
    const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    const body = input.action === "submit" ? { action: "submit", title: text(input.title, 200), body: text(input.body, 3000) } : { action: "cancel" };
    const upstream = await fetch(`${base}/api/agent/submissions/${id.toLowerCase()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ERP-Delegation": delegate(actor, { path: "/", module: "general", entity: null }) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    }).catch(() => null);
    if (!upstream?.ok) throw new BffError(upstream?.status === 404 ? 404 : 502, "Draf belum dapat dikirim.");
    const result = await upstream.json();
    return NextResponse.json({ id: result.id, intent: result.intent, state: result.state }, { headers });
  } catch (error) {
    if (error instanceof BffError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("agent_submission_failed");
    return NextResponse.json({ error: "Draf belum dapat dikirim." }, { status: 503, headers });
  }
}
