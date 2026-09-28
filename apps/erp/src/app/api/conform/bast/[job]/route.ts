// The canonical BAST PDF of one ConForm generation job, downloaded through Celerates (doc 21 §7).
import { NextResponse } from "next/server";
import { conform } from "@/lib/conform/client";
import { describeConformError, pmoActor } from "@/lib/conform/pmo";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(job)) return NextResponse.json({ error: "Tidak ditemukan." }, { status: 404 });
  try {
    await pmoActor("full");
    const upstream = await conform.raw("GET", `/bast/generations/${job}/document`, { timeoutMs: 60000 });
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": upstream.headers.get("content-disposition") ?? `attachment; filename="BAST-${job}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Bast-Fingerprint": upstream.headers.get("x-bast-fingerprint") ?? "",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: describeConformError(error) }, { status: 502 });
  }
}
