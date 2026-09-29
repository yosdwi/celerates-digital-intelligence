// M6.x: save an Agent attachment (working context) as a governed Company File. Explicit and reviewed: the user picks
// kind, class and owning division; Intelligence checks the attachment is theirs and the class rule (kind minimum).
import { NextRequest } from "next/server";
import { BffError } from "@/lib/agent/bff";
import { failure, relay, upstream, UUID } from "@/lib/files/bff";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (raw.length > 4096) throw new BffError(413, "Permintaan terlalu besar.");
    let input: Record<string, unknown>;
    try { input = JSON.parse(raw); } catch { throw new BffError(422, "JSON tidak valid."); }
    if (typeof input.dataset_id !== "string" || !UUID.test(input.dataset_id)) throw new BffError(422, "Lampiran tidak dikenali.");
    if (typeof input.kind !== "string" || !/^[a-z_]{2,40}$/.test(input.kind)) throw new BffError(422, "Pilih jenis berkas.");
    const body: Record<string, unknown> = { dataset_id: input.dataset_id.toLowerCase(), kind: input.kind };
    for (const key of ["access_class", "owner_division", "title"])
      if (typeof input[key] === "string" && (input[key] as string).trim()) body[key] = (input[key] as string).trim().slice(0, 200);
    return relay(await upstream("/from-attachment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), write: request }), 201);
  } catch (error) {
    return failure(error);
  }
}
