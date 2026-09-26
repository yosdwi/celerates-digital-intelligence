// Agent BFF helpers (ADR-008). Session → fresh ERP actor → page context → delegation → Intelligence.
// The browser only ever talks same-origin to /api/agent/*; it never receives a delegation or Intelligence URL.
import type { NextRequest } from "next/server";
import { sql } from "@/db";
import { requirePilotActor } from "@/lib/actor";
import { MODULES, operationalContext } from "@/lib/operations/policy";
import { CATALOG, hrefFor, resolvePageEntity } from "./catalog";
import { delegationConfigured, mintDelegation, type DelegationContext } from "./delegation";
import { AgentReadError, canReadEntityModule, loadActor, type AgentActor } from "./reads";

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Accel-Buffering": "no",
  Vary: "Cookie",
};

export function intelligenceBase(): string | null {
  const raw = process.env.INTELLIGENCE_BASE_URL;
  if (!raw) return null;
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
  return url.origin + url.pathname.replace(/\/+$/, "");
}

export function agentEnabled(): boolean {
  return delegationConfigured() && intelligenceBase() !== null;
}

export class BffError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function agentActor(): Promise<AgentActor> {
  let pilot;
  try {
    pilot = await requirePilotActor();
  } catch {
    throw new BffError(403, "Akses tidak tersedia.");
  }
  try {
    return await loadActor(sql, pilot.id);
  } catch (error) {
    if (error instanceof AgentReadError) throw new BffError(403, "Akses tidak tersedia.");
    throw error;
  }
}

export function assertSameOrigin(request: NextRequest) {
  const origin = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).origin : request.nextUrl.origin;
  if (request.headers.get("origin") !== origin) throw new BffError(403, "Origin tidak sesuai.");
}

export type PageEntity = { type: string; type_label: string; id: string; label: string; href: string };

/** Page context from catalog routes; an entity is attached only if it exists and the actor may read its module. */
export async function pageContext(actor: AgentActor, rawPath: unknown) {
  const context = operationalContext(rawPath);
  const ref = resolvePageEntity(typeof rawPath === "string" ? rawPath.split(/[?#]/)[0] : "/");
  let entity: PageEntity | null = null;
  if (ref) {
    const def = CATALOG.get(ref.type)!;
    if (canReadEntityModule(actor, def.module)) {
      const [row] = await sql.unsafe<{ label: string }[]>(
        `SELECT ${def.display} AS label FROM ${def.table} ${def.alias} WHERE ${def.alias}.id = $1::uuid`,
        [ref.id],
      );
      if (row) entity = { type: def.type, type_label: def.label, id: ref.id, label: row.label, href: hrefFor(def.type, ref.id) };
    }
  }
  return { context: { ...context, label: MODULES[context.module] }, entity };
}

export function delegate(actor: AgentActor, ctx: DelegationContext): string {
  return mintDelegation(
    {
      id: actor.id,
      name: actor.name,
      owner: actor.isOwner === true,
      access: (actor.access ?? []).map((a) => ({ division: a.divisionKey, level: a.level })),
    },
    ctx,
  );
}

/** One AG-UI RUN_ERROR as an SSE body, so AG-UI clients surface failures in-band. */
export function sseError(message: string, code: string): Response {
  const event = { type: "RUN_ERROR", message, code, timestamp: Date.now() };
  return new Response(`data: ${JSON.stringify(event)}\n\n`, { status: 200, headers: SSE_HEADERS });
}

export async function proxyEvents(base: string, runId: string, token: string, lastEventId: string | null, signal: AbortSignal) {
  const headers: Record<string, string> = { "X-ERP-Delegation": token, Accept: "text/event-stream" };
  if (lastEventId && /^\d{1,9}$/.test(lastEventId)) headers["Last-Event-ID"] = lastEventId;
  const upstream = await fetch(`${base}/api/agent/runs/${encodeURIComponent(runId)}/events`, { headers, signal, cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return sseError(upstream.status === 404 ? "Run tidak ditemukan." : "Intelligence belum dapat dihubungi.", `UPSTREAM_${upstream.status}`);
  }
  return new Response(upstream.body, { status: 200, headers: SSE_HEADERS });
}

/** Best-effort learning signal: tell Intelligence how the user decided on an Agent proposal. ERP state and the
 * receipts are already committed; a failure here never affects them (the Console can re-read ERP later). */
export async function reportOutcome(
  actor: AgentActor,
  proposal: { id: string; run_id: string | null; state: string; counts: unknown; receipts: unknown; outcome: unknown; items?: unknown[] },
) {
  const base = intelligenceBase();
  if (!proposal.run_id || !base || !agentEnabled()) return;
  try {
    const token = delegate(actor, { path: "/", module: "general", entity: null });
    const edits = (proposal.items as { params?: unknown; receipt?: { params?: unknown } | null }[] | undefined)?.filter(
      (i) => i.receipt?.params && JSON.stringify(i.receipt.params) !== JSON.stringify(i.params),
    ).length;
    await fetch(`${base}/api/agent/runs/${encodeURIComponent(proposal.run_id)}/outcomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ERP-Delegation": token },
      body: JSON.stringify({ proposal_id: proposal.id, state: proposal.state, counts: proposal.counts, receipts: proposal.receipts, outcome: proposal.outcome, edited_items: edits ?? 0 }),
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
  } catch {
    console.error("agent_outcome_report_failed");
  }
}
