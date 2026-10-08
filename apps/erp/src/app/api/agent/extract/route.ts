// AI form fill (Sales roadmap #3): pasted client email / RFQ → Intelligence → proposed New Opportunity fields. The
// model's answer is validated here against V1's codes (normalizeAiFill) and only fills the form; nothing is saved.
import { NextRequest, NextResponse } from "next/server";
import { agentActor, agentEnabled, assertSameOrigin, BffError, delegate, intelligenceBase } from "@/lib/agent/bff";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { normalizeAiFill } from "@/features/sales-v2/ai-fill";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await agentActor();
    await requireDivisionAccess("sales").catch(() => { throw new BffError(403, "Butuh akses Editor Sales."); });
    const base = intelligenceBase();
    if (!agentEnabled() || !base) throw new BffError(503, "AI belum dikonfigurasi.");
    const body = await request.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (text.length < 10 || text.length > 12000) throw new BffError(422, "Tempel email atau RFQ (10–12.000 karakter).");
    const upstream = await fetch(`${base}/api/agent/extract-opportunity`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ERP-Delegation": delegate(actor, { path: "/sales/v2/opportunity-tracker", module: "sales", entity: null }) },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(45000),
      cache: "no-store",
    }).catch(() => null);
    const out = await upstream?.json().catch(() => ({}));
    if (!upstream?.ok) throw new BffError(upstream?.status === 503 ? 503 : 502, "AI belum bisa membaca teks ini; isi form secara manual.");
    return NextResponse.json({ fields: normalizeAiFill(out?.fields), model: typeof out?.model === "string" ? out.model : null }, { headers });
  } catch (error) {
    if (error instanceof BffError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("agent_extract_failed");
    return NextResponse.json({ error: "AI belum tersedia." }, { status: 503, headers });
  }
}
