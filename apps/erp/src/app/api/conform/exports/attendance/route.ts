// Canonical attendance CSV (doc 21 §7): produced by ConForm's exporter, audited there with the Celerates actor,
// and handed to the PMO from Celerates. Celerates never builds the file.
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, BffError } from "@/lib/agent/bff";
import { conform } from "@/lib/conform/client";
import { describeConformError, pmoActor } from "@/lib/conform/pmo";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await pmoActor("editor");
    const form = await request.formData();
    const year = Number(form.get("year"));
    const month = Number(form.get("month"));
    const reportType = String(form.get("report_type") ?? "");
    if (!Number.isInteger(year) || !Number.isInteger(month) || !["developer", "shifting"].includes(reportType)) return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 422 });
    const upstream = await conform.raw("POST", "/exports/attendance", { actor: actor.tag, body: { year, month, report_type: reportType }, timeoutMs: 60000 });
    const disposition = upstream.headers.get("content-disposition") ?? `attachment; filename="attendance-${year}-${month}-${reportType}.csv"`;
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store",
        "X-Export-Id": upstream.headers.get("x-export-id") ?? "",
        "X-Cycle-Id": upstream.headers.get("x-cycle-id") ?? "",
      },
    });
  } catch (error) {
    if (error instanceof BffError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: describeConformError(error) }, { status: 502 });
  }
}
