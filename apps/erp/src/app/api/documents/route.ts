import { requirePilotActor } from "@/lib/actor";
import { readObject } from "@/lib/object-store";
import { sql } from "@/db";
import { canReadEntityModule, loadActor } from "@/lib/agent/reads";
import { objectModule } from "@/lib/files/sources";
export const dynamic = "force-dynamic";
// Private object download. The object must belong to a record the user can read (module access), not merely exist.
// Keys that no declared row references are served to Owners only, for legacy compatibility, until the pilot opens
// beyond Owners (set DOCUMENTS_STRICT=1 to refuse them now).
export async function GET(request: Request) {
  let pilot;
  try { pilot = await requirePilotActor(); } catch { return new Response("Unauthorized", { status: 403 }); }
  const params = new URL(request.url).searchParams;
  const bucket = params.get("bucket") || "";
  const path = params.get("path") || "";
  try {
    const actor = await loadActor(sql, pilot.id);
    const module = await objectModule(sql, bucket, path);
    if (module ? !canReadEntityModule(actor, module) : process.env.DOCUMENTS_STRICT === "1" || actor.isOwner !== true) return new Response("Object unavailable", { status: 404 });
    const object = await readObject(bucket, path);
    const contentType = /^(image\/(png|jpeg|webp)|application\/pdf|video\/(mp4|webm|quicktime))$/.test(object.contentType) ? object.contentType : "application/octet-stream";
    return new Response(new Uint8Array(object.body), { headers: { "Content-Type": contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": "inline" } });
  } catch { return new Response("Object unavailable", { status: 404 }); }
}
