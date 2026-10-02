// One identity document: GET streams the decrypted file to an authorized, recently confirmed user (audited before
// any byte leaves); PATCH records verification. Responses are never cacheable and never rendered as active content.
import { sql } from "@/db";
import { currentClaims, requestMeta } from "@/lib/actor";
import { IdentityDocError, readIdentityDocument, verifyIdentityDocument } from "@/lib/security/identity-documents";

export const dynamic = "force-dynamic";
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await currentClaims();
  if (!claims) return json({ error: "unauthorized" }, 403);
  const { id } = await params;
  try {
    const doc = await readIdentityDocument(sql, claims, id, await requestMeta());
    return new Response(new Uint8Array(doc.bytes), {
      headers: {
        "Content-Type": doc.mediaType,
        "Content-Length": String(doc.bytes.length),
        // The ERP viewer fetches the bytes and shows a blob URL; a direct navigation only ever downloads.
        "Content-Disposition": `attachment; filename="${doc.docType}.${EXT[doc.mediaType]}"`,
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    if (error instanceof IdentityDocError) return json({ error: error.code }, error.status);
    console.error("[identity-documents] read failed", (error as Error).name);
    return json({ error: "unavailable" }, 500);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await currentClaims();
  if (!claims) return json({ error: "unauthorized" }, 403);
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { status?: string };
  if (body.status !== "verified" && body.status !== "rejected") return json({ error: "invalid_status" }, 400);
  try {
    await verifyIdentityDocument(sql, claims, id, body.status, await requestMeta());
    return json({ ok: true }, 200);
  } catch (error) {
    if (error instanceof IdentityDocError) return json({ error: error.code }, error.status);
    return json({ error: "unavailable" }, 500);
  }
}
