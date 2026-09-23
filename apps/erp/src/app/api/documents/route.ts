import { requirePilotActor } from "@/lib/actor";
import { readObject } from "@/lib/object-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { await requirePilotActor(); } catch { return new Response("Unauthorized", { status: 403 }); }
  const params = new URL(request.url).searchParams;
  try {
    const object = await readObject(params.get("bucket") || "", params.get("path") || "");
    const contentType = /^(image\/(png|jpeg|webp)|application\/pdf|video\/(mp4|webm|quicktime))$/.test(object.contentType) ? object.contentType : "application/octet-stream";
    return new Response(new Uint8Array(object.body), { headers: { "Content-Type": contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": "inline" } });
  } catch { return new Response("Object unavailable", { status: 404 }); }
}
