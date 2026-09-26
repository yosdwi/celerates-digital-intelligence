// Delegated agent reads on the versioned machine contract: /api/integration/v1/agent/*.
// Requires BOTH the machine read credential (checked by the caller) and an ERP-verified user delegation.
import type { NextRequest } from "next/server";
import type { Sql } from "postgres";
import { fail } from "@/lib/integration/contract";
import { readSignal } from "@/lib/operations/reader";
import { publicCatalog } from "./catalog";
import { DelegationError, verifyDelegation } from "./delegation";
import { AgentReadError, loadActor, readEntity, readEntitySignals, readNeighbours, search } from "./reads";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE = /^[a-z_]{2,40}$/;
const KEY = /^[a-z0-9-]{2,60}$/;

export async function handleAgent(request: NextRequest, path: string[], sql: Sql): Promise<unknown> {
  if (request.method !== "GET") fail(405, "METHOD", "Agent contract is read-only.");
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
    if (a === "catalog" && path.length === 2) return publicCatalog();
    if (a === "signals" && b && KEY.test(b) && path.length === 3) {
      const signal = await readSignal(sql, actor, b);
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
    throw error;
  }
}
