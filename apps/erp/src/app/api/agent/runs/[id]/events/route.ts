// Resume an Agent run's AG-UI stream after a dropped connection (Last-Event-ID). Same session → fresh delegation.
import { NextRequest, NextResponse } from "next/server";
import { agentActor, agentEnabled, BffError, delegate, intelligenceBase, pageContext, proxyEvents, sseError } from "@/lib/agent/bff";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) throw new BffError(404, "Run tidak ditemukan.");
    const actor = await agentActor();
    const base = intelligenceBase();
    if (!agentEnabled() || !base) return NextResponse.json({ error: "Agent belum dikonfigurasi." }, { status: 503 });
    const page = await pageContext(actor, request.nextUrl.searchParams.get("path") || "/");
    const token = delegate(actor, { path: page.context.path, module: page.context.module, entity: page.entity ? { type: page.entity.type, id: page.entity.id } : null });
    return await proxyEvents(base, id.toLowerCase(), token, request.headers.get("last-event-id"), request.signal);
  } catch (error) {
    if (error instanceof BffError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    console.error("agent_resume_failed");
    return sseError("Agent belum dapat dihubungi.", "BFF_ERROR");
  }
}
