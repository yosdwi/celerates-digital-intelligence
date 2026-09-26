// AG-UI endpoint for the embedded Agent (ADR-013). Accepts RunAgentInput and answers with an AG-UI SSE stream.
// Only forwardedProps.{skill,args,path} and the last user message text are used. Client-supplied tools, state
// and context are ignored: the server decides what runs, under the session user's ERP authority (ADR-008).
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { agentActor, agentEnabled, assertSameOrigin, BffError, delegate, intelligenceBase, pageContext, proxyEvents, sseError } from "@/lib/agent/bff";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THREAD = /^[A-Za-z0-9_-]{8,100}$/;
type Input = { threadId?: unknown; runId?: unknown; messages?: unknown; forwardedProps?: { skill?: unknown; args?: unknown; path?: unknown } };
function lastUserText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: unknown; content?: unknown };
    if (m?.role === "user" && typeof m.content === "string") return m.content.slice(0, 500);
  }
  return "";
}
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await agentActor();
    const base = intelligenceBase();
    if (!agentEnabled() || !base) return NextResponse.json({ error: "Agent belum dikonfigurasi." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    const raw = await request.text();
    if (raw.length > 32768) throw new BffError(413, "Permintaan terlalu besar.");
    let input: Input;
    try { input = JSON.parse(raw); } catch { throw new BffError(422, "JSON tidak valid."); }
    const props = input.forwardedProps ?? {};
    const skill = String(props.skill ?? "");
    const given = (props.args && typeof props.args === "object" && !Array.isArray(props.args) ? props.args : {}) as Record<string, unknown>;
    const page = await pageContext(actor, typeof props.path === "string" ? props.path : "/");
    let args: Record<string, unknown>;
    if (skill === "explain_signal" || skill === "follow_up_signal") args = { signal_key: String(given.signal_key ?? "") };
    else if (skill === "import_dataset") {
      // The dataset is owned by this user in Intelligence; a foreign id fails there under this user's delegation.
      if (typeof given.dataset_id !== "string" || !UUID.test(given.dataset_id)) throw new BffError(422, "Berkas tidak dikenali.");
      args = { dataset_id: given.dataset_id.toLowerCase() };
      // A user-corrected mapping from the mapping card. Intelligence re-validates it against ERP specs and the file.
      if (typeof given.command === "string" && /^[a-z_]{2,40}\.[a-z_]{2,40}$/.test(given.command)) {
        const raw = given.mapping && typeof given.mapping === "object" && !Array.isArray(given.mapping) ? (given.mapping as Record<string, unknown>) : {};
        const mapping = Object.fromEntries(
          Object.entries(raw)
            .filter(([k, v]) => /^[a-z_]{2,40}$/.test(k) && typeof v === "string" && v.length > 0 && v.length <= 80)
            .slice(0, 30),
        );
        args = { ...args, command: given.command, mapping };
      }
    }
    else if (skill === "search") args = { query: String(given.query ?? lastUserText(input.messages)).trim().slice(0, 100) };
    else if (skill === "ask") {
      args = { query: String(given.query ?? lastUserText(input.messages)).trim().slice(0, 300) };
      // A document the user attached earlier in this conversation; Intelligence checks it belongs to this user.
      if (typeof given.dataset_id === "string" && UUID.test(given.dataset_id)) args.dataset_id = given.dataset_id.toLowerCase();
    } else if (skill === "read_document") {
      if (typeof given.dataset_id !== "string" || !UUID.test(given.dataset_id)) throw new BffError(422, "Berkas tidak dikenali.");
      args = { dataset_id: given.dataset_id.toLowerCase() };
    }
    else if (skill === "explain_entity") {
      // Only the entity the user is looking at, and only if ERP resolved it as readable for this user.
      if (!page.entity) throw new BffError(422, "Halaman ini belum memiliki record yang dikenali Agent.");
      args = { entity_type: page.entity.type, entity_id: page.entity.id };
    } else throw new BffError(422, "Skill tidak dikenal.");
    const runId = typeof input.runId === "string" && UUID.test(input.runId) ? input.runId.toLowerCase() : randomUUID();
    const threadId = typeof input.threadId === "string" && THREAD.test(input.threadId) ? input.threadId : "thread-" + runId;
    const token = delegate(actor, {
      path: page.context.path,
      module: page.context.module,
      entity: page.entity ? { type: page.entity.type, id: page.entity.id } : null,
    });
    const created = await fetch(`${base}/api/agent/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ERP-Delegation": token },
      body: JSON.stringify({ run_id: runId, thread_id: threadId, skill, args }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    }).catch(() => null);
    if (!created) return sseError("Intelligence belum dapat dihubungi.", "UPSTREAM_UNAVAILABLE");
    if (created.status === 422) return sseError("Permintaan belum lengkap untuk skill ini.", "INVALID_ARGS");
    if (!created.ok) return sseError("Intelligence menolak permintaan.", `UPSTREAM_${created.status}`);
    return await proxyEvents(base, runId, token, null, request.signal);
  } catch (error) {
    if (error instanceof BffError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    console.error("agent_run_failed");
    return sseError("Agent belum dapat dijalankan. Coba lagi.", "BFF_ERROR");
  }
}
