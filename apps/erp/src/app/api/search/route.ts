// Beranda search (doc 18 §17): ERP records the session user may read, from the governed Entity Catalog search —
// internal display fields only, module-authorized per entity type. Company Files are searched through /api/files.
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/db";
import { agentActor, BffError } from "@/lib/agent/bff";
import { AgentReadError, search } from "@/lib/agent/reads";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  try {
    const actor = await agentActor();
    if (q.length < 2) return NextResponse.json({ query: q, results: [], truncated: false }, { headers });
    // Every term must match first; when nothing does, fall back to any term so a partial phrase still finds records.
    let found = await search(sql, actor, q, "all");
    if (!found.results.length && found.terms.length > 1) found = await search(sql, actor, q, "any");
    const results = found.results.map(({ type, type_label, id, label, href, module, matched_field }) => ({ type, type_label, id, label, href, module, matched_field }));
    return NextResponse.json({ query: found.query, results, truncated: found.truncated }, { headers });
  } catch (error) {
    if (error instanceof AgentReadError && error.status === 422) return NextResponse.json({ query: q, results: [], truncated: false }, { headers });
    if (error instanceof BffError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("erp_search_failed");
    return NextResponse.json({ error: "Pencarian belum dapat dimuat." }, { status: 503, headers });
  }
}
