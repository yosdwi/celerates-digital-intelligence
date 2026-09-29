// Push-to-talk (ADR-012): the session user's recording → Intelligence transcription → editable text. Nothing runs
// and nothing is confirmed by voice; the transcript only fills the composer. Audio is not stored by ERP.
import { NextRequest, NextResponse } from "next/server";
import { agentActor, agentEnabled, assertSameOrigin, BffError, delegate, intelligenceBase } from "@/lib/agent/bff";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const MAX = 5 * 1024 * 1024;
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await agentActor();
    const base = intelligenceBase();
    if (!agentEnabled() || !base) throw new BffError(503, "Agent belum dikonfigurasi.");
    if (Number(request.headers.get("content-length") || 0) > MAX + 65536) throw new BffError(413, "Rekaman terlalu panjang.");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File) || !file.type.startsWith("audio/") || file.size > MAX) throw new BffError(422, "Rekaman tidak valid.");
    const out = new FormData();
    out.append("file", file, "speech");
    const upstream = await fetch(`${base}/api/agent/transcribe`, {
      method: "POST",
      headers: { "X-ERP-Delegation": delegate(actor, { path: "/", module: "general", entity: null }) },
      body: out,
      signal: AbortSignal.timeout(40000),
      cache: "no-store",
    }).catch(() => null);
    const body = await upstream?.json().catch(() => ({}));
    if (!upstream?.ok || typeof body?.text !== "string") throw new BffError(upstream?.status === 503 ? 503 : 502, "Transkripsi belum tersedia; ketik pertanyaan Anda.");
    return NextResponse.json({ text: body.text.slice(0, 300) }, { headers });
  } catch (error) {
    if (error instanceof BffError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("agent_transcribe_failed");
    return NextResponse.json({ error: "Transkripsi belum tersedia." }, { status: 503, headers });
  }
}
