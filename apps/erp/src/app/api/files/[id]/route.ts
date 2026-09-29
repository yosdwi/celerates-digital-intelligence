// Company Files: one file's detail (GET) and the user's actions on it (POST: withdraw, reclassify, link).
import { NextRequest } from "next/server";
import { BffError } from "@/lib/agent/bff";
import { failure, relay, upstream, UUID } from "@/lib/files/bff";
export const dynamic = "force-dynamic";
const ACTIONS = ["withdraw", "reclassify", "link"];

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) throw new BffError(404, "Berkas tidak ditemukan.");
    return relay(await upstream(`/${id.toLowerCase()}`));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) throw new BffError(404, "Berkas tidak ditemukan.");
    const raw = await request.text();
    if (raw.length > 4096) throw new BffError(413, "Permintaan terlalu besar.");
    let input: Record<string, unknown>;
    try { input = JSON.parse(raw); } catch { throw new BffError(422, "JSON tidak valid."); }
    if (!ACTIONS.includes(String(input.action))) throw new BffError(422, "Aksi tidak dikenal.");
    const body: Record<string, unknown> = { action: input.action };
    for (const key of ["access_class", "owner_division", "entity_type", "entity_id", "entity_label", "entity_href"])
      if (typeof input[key] === "string" && (input[key] as string).trim()) body[key] = (input[key] as string).trim().slice(0, 300);
    return relay(await upstream(`/${id.toLowerCase()}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), write: request }));
  } catch (error) {
    return failure(error);
  }
}
