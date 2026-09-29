// Company Files BFF (ADR-018): session → fresh ERP actor → delegation → Intelligence /api/files. The browser talks
// same-origin to /api/files/* only; it never receives a delegation or the Intelligence URL.
import { NextResponse, type NextRequest } from "next/server";
import { agentActor, agentEnabled, assertSameOrigin, BffError, delegate, intelligenceBase } from "@/lib/agent/bff";

export const HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX = 20 * 1024 * 1024;

export async function upstream(path: string, init: RequestInit & { write?: NextRequest } = {}) {
  if (init.write) assertSameOrigin(init.write);
  const actor = await agentActor();
  const base = intelligenceBase();
  if (!agentEnabled() || !base) throw new BffError(503, "Company Files belum dikonfigurasi.");
  const token = delegate(actor, { path: "/files", module: "general", entity: null });
  const response = await fetch(`${base}/api/files${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), "X-ERP-Delegation": token },
    signal: AbortSignal.timeout(60000),
    cache: "no-store",
  }).catch(() => null);
  if (!response) throw new BffError(503, "Intelligence belum dapat dihubungi.");
  return response;
}

/** JSON pass-through with Intelligence's user-facing message for 4xx, a generic one otherwise. */
export async function relay(response: Response, status?: number) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body.detail === "string" && response.status < 500 ? body.detail : "Company Files belum dapat diproses.";
    return NextResponse.json({ error: message }, { status: response.status < 500 ? response.status : 502, headers: HEADERS });
  }
  return NextResponse.json(body, { status: status ?? response.status, headers: HEADERS });
}

export function failure(error: unknown) {
  if (error instanceof BffError) return NextResponse.json({ error: error.message }, { status: error.status, headers: HEADERS });
  console.error("company_files_failed");
  return NextResponse.json({ error: "Company Files belum dapat diproses." }, { status: 503, headers: HEADERS });
}
