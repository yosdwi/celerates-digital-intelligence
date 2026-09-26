// `Drop anything`: the session user uploads a table (CSV/XLSX → import) or a document (PDF/DOCX/TXT/MD → read and
// ask); ERP forwards it to Intelligence under that user's delegation. Nothing in ERP changes here.
import { NextRequest, NextResponse } from "next/server";
import { agentActor, agentEnabled, assertSameOrigin, BffError, delegate, intelligenceBase } from "@/lib/agent/bff";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const MAX = 8 * 1024 * 1024; // documents; Intelligence caps tables at 2 MB
const NAME = /\.(csv|xlsx|pdf|docx|txt|md)$/i;
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await agentActor();
    const base = intelligenceBase();
    if (!agentEnabled() || !base) throw new BffError(503, "Agent belum dikonfigurasi.");
    if (Number(request.headers.get("content-length") || 0) > MAX + 65536) throw new BffError(413, "Ukuran maksimum 8 MB.");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File) || !NAME.test(file.name)) throw new BffError(422, "Unggah CSV, XLSX, PDF, DOCX, TXT atau Markdown.");
    if (file.size > MAX) throw new BffError(413, "Ukuran maksimum 8 MB.");
    const out = new FormData();
    out.append("file", file, file.name.slice(-120));
    const upstream = await fetch(`${base}/api/agent/datasets`, {
      method: "POST",
      headers: { "X-ERP-Delegation": delegate(actor, { path: "/", module: "general", entity: null }) },
      body: out,
      signal: AbortSignal.timeout(45000),
      cache: "no-store",
    }).catch(() => null);
    if (!upstream) throw new BffError(503, "Intelligence belum dapat dihubungi.");
    const body = await upstream.json().catch(() => ({}));
    if (upstream.status === 422) throw new BffError(422, typeof body.detail === "string" ? body.detail : "Berkas tidak dapat dibaca.");
    if (!upstream.ok) throw new BffError(502, "Intelligence menolak berkas.");
    return NextResponse.json(
      { id: body.id, name: body.name, kind: body.kind === "document" ? "document" : "table", rows: body.profile?.rows ?? 0, columns: body.profile?.columns?.length ?? 0, pages: body.profile?.pages ?? 0 },
      { status: 201, headers },
    );
  } catch (error) {
    if (error instanceof BffError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("agent_dataset_upload_failed");
    return NextResponse.json({ error: "Berkas belum dapat diunggah." }, { status: 503, headers });
  }
}
