// Delegated agent reads on the versioned machine contract: /api/integration/v1/agent/*.
// Requires BOTH the machine read credential (checked by the caller) and an ERP-verified user delegation.
import type { NextRequest } from "next/server";
import type { Sql } from "postgres";
import { fail } from "@/lib/integration/contract";
import { readSignal } from "@/lib/operations/reader";
import { publicCatalog } from "./catalog";
import { DelegationError, verifyDelegation } from "./delegation";
import { AgentReadError, loadActor, readEntity, readEntitySignals, readNeighbours, search } from "./reads";
import { createProposal, getProposal, ProposalError } from "./proposals";
import { publicCommands } from "./commands";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE = /^[a-z_]{2,40}$/;
const KEY = /^[a-z0-9-]{2,60}$/;

export async function handleAgent(request: NextRequest, path: string[], sql: Sql): Promise<unknown> {
  const proposing = request.method === "POST" && path.length === 2 && path[1] === "proposals";
  if (request.method !== "GET" && !proposing) fail(405, "METHOD", "Agent contract reads only, except creating an ERP-held proposal.");
  let claims;
  try {
    claims = verifyDelegation(request.headers.get("x-erp-delegation"));
  } catch (error) {
    if (error instanceof DelegationError) fail(401, "DELEGATION", "Valid ERP user delegation required.");
    throw error;
  }
  try {
    const actor = await loadActor(sql, claims.sub);
    const [, a, b, c, d] = path;
    if (proposing) {
      // Creates a pending proposal only. No business effect until the same user confirms it in ERP.
      const key = request.headers.get("idempotency-key") ?? "";
      if (!/^[A-Za-z0-9:_-]{8,160}$/.test(key)) fail(422, "SCHEMA", "Idempotency-Key required.");
      const raw = await request.text();
      if (Buffer.byteLength(raw) > 524288) fail(413, "TOO_LARGE", "Maximum proposal payload is 512 KiB.");
      let body: unknown;
      try { body = JSON.parse(raw); } catch { fail(422, "SCHEMA", "Invalid JSON."); }
      return await createProposal(sql, { ...actor, id: actor.id, name: actor.name }, key, body);
    }
    if (a === "catalog" && path.length === 2) return { ...publicCatalog(), commands: publicCommands() };
    if (a === "proposals" && b && UUID.test(b) && path.length === 3) return await getProposal(sql, actor, b.toLowerCase());
    if (a === "signals" && b && KEY.test(b) && path.length === 3) {
      const items = Number(request.nextUrl.searchParams.get("items") || 5);
      const signal = await readSignal(sql, actor, b, new Date(), Number.isFinite(items) ? items : 5);
      if (!signal) fail(404, "NOT_FOUND", "Signal not available.");
      return { schema_version: "1.0", as_of: signal.as_of, signal };
    }
    if (a === "search" && path.length === 2) return await search(sql, actor, request.nextUrl.searchParams.get("q") || "");
    if (a === "entities" && b && TYPE.test(b) && c && UUID.test(c)) {
      const id = c.toLowerCase();
      if (path.length === 4) return await readEntity(sql, actor, b, id);
      if (path.length === 5 && d === "neighbours") return await readNeighbours(sql, actor, b, id);
      if (path.length === 5 && d === "signals") return await readEntitySignals(sql, actor, b, id);
    }
    fail(404, "NOT_FOUND", "Agent contract operation not available.");
  } catch (error) {
    if (error instanceof AgentReadError)
      fail(error.status, error.code, error.status === 403 ? "Not permitted for this user." : "Not available.");
    if (error instanceof ProposalError) fail(error.status, error.code, error.message);
    throw error;
  }
}
