// Evidence for a Talent correction, streamed from ConForm to a PMO reviewer (doc 19 §7). ConForm keeps the bytes.
import { NextResponse } from "next/server";
import { conform } from "@/lib/conform/client";
import { describeConformError, pmoActor } from "@/lib/conform/pmo";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Tidak ditemukan." }, { status: 404 });
  try {
    await pmoActor("viewer");
    const upstream = await conform.raw("GET", `/attendance-corrections/${id}/evidence`);
    const type = upstream.headers.get("content-type") ?? "application/octet-stream";
    if (!/^image\/(png|jpeg|webp)$/.test(type)) return NextResponse.json({ error: "Jenis berkas tidak didukung." }, { status: 415 });
    return new NextResponse(upstream.body, { headers: { "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return NextResponse.json({ error: describeConformError(error) }, { status: 502 });
  }
}
