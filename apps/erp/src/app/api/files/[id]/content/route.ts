// Company Files: open a file. Managed files stream from Intelligence (authorized and logged there); ERP files open
// through ERP's own authorized document route; external links open at their URL. Inline only for PDF and images,
// always sandboxed; everything else downloads.
import { NextRequest, NextResponse } from "next/server";
import { BffError } from "@/lib/agent/bff";
import { failure, HEADERS, upstream, UUID } from "@/lib/files/bff";
export const dynamic = "force-dynamic";
const INLINE = /^(application\/pdf|image\/(png|jpeg|webp))$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) throw new BffError(404, "Berkas tidak ditemukan.");
    const preview = request.nextUrl.searchParams.get("preview") === "1";
    const response = await upstream(`/${id.toLowerCase()}/content?action=${preview ? "preview" : "download"}`);
    if (response.status === 409) {
      // ERP or external origin: log the open in Intelligence, then hand over to where the file lives.
      const opened = await (await upstream(`/${id.toLowerCase()}/opened`, { method: "POST" })).json().catch(() => ({}));
      const target = typeof opened.open_url === "string" ? opened.open_url : null;
      if (!target || !(target.startsWith("/api/documents?") || /^https?:\/\//.test(target))) throw new BffError(404, "Berkas tidak tersedia.");
      return NextResponse.redirect(new URL(target, request.nextUrl.origin), { status: 303, headers: HEADERS });
    }
    if (!response.ok) throw new BffError(response.status === 404 ? 404 : 403, "Berkas tidak tersedia.");
    const type = response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream";
    const name = decodeURIComponent(response.headers.get("x-file-name") ?? "berkas").replace(/[^\w.\- ]/g, "_").slice(0, 120);
    const inline = preview && INLINE.test(type);
    return new Response(response.body, {
      headers: {
        ...HEADERS,
        "Content-Type": inline ? type : "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
