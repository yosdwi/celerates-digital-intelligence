// AI form fill (Sales roadmap #3): pasted text, an uploaded PO/PKS, or an Opportunity's latest emails → Intelligence →
// proposed form fields. The model's answer is validated here against V1's codes (normalizeAiResult) and only fills the
// form; nothing is saved. JSON {form, text, opportunityId?} or multipart {form, file}.
import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { crmClients, crmEmails, salesOpportunityTrackers } from "@/db/schema";
import { agentActor, agentEnabled, assertSameOrigin, BffError, delegate, intelligenceBase } from "@/lib/agent/bff";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { isAiForm, normalizeAiResult, type AiForm } from "@/features/sales-v2/ai-fill";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const MAX_FILE = 8 * 1024 * 1024;
const FILE_TYPES = /\.(pdf|docx|png|jpe?g)$/i;

/** The Opportunity as it is now, and its account's latest mail, as the text the model reads. */
async function updateSource(id: string): Promise<{ text: string; lastMail: string | null }> {
  const [t] = await db.select().from(salesOpportunityTrackers).where(eq(salesOpportunityTrackers.id, id));
  if (!t) throw new BffError(404, "Opportunity tidak ditemukan.");
  const [acc] = await db.select({ id: crmClients.id }).from(crmClients).where(sql`lower(${crmClients.name}) = lower(${t.client_name})`);
  const mail = acc ? await db.select().from(crmEmails).where(eq(crmEmails.client_id, acc.id)).orderBy(desc(crmEmails.sent_at)).limit(8) : [];
  if (!mail.length) throw new BffError(422, `Belum ada email dengan ${t.client_name}. Tempel teksnya di kotak ini.`);
  const now = [
    `stage: ${t.opty_status_code ?? "-"}`, `posisi: ${t.position_name ?? "-"}`, `level: ${t.level_code ?? "-"}`, `headcount: ${t.headcount_target ?? "-"}`,
    `durasi_bulan: ${t.estimated_duration_months ?? "-"}`, `harga: ${t.price_amount ?? "-"} (${t.price_period_code ?? "-"})`,
    `progress_notes_terakhir: ${(t.progress_notes ?? "-").slice(-600)}`,
  ].join("\n");
  const emails = [...mail].reverse().map((m) =>
    `--- ${m.sent_at.toISOString().slice(0, 10)} ${m.direction === "out" ? "KELUAR" : "MASUK"} dari ${m.from_address} ke ${m.to_addresses.join(", ")}\nSubjek: ${m.subject}\n${(m.body_text ?? "").replace(/^>.*$/gm, "").slice(0, 1500)}`,
  ).join("\n\n");
  return { text: `DATA OPPORTUNITY SAAT INI\n${now}\n\nEMAIL TERBARU (lama ke baru)\n${emails}`.slice(0, 12000), lastMail: mail[0].sent_at.toISOString().slice(0, 10) };
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await agentActor();
    await requireDivisionAccess("sales").catch(() => { throw new BffError(403, "Butuh akses Editor Sales."); });
    const base = intelligenceBase();
    if (!agentEnabled() || !base) throw new BffError(503, "AI belum dikonfigurasi.");
    const delegation = delegate(actor, { path: "/sales/v2", module: "sales", entity: null });

    let form: AiForm;
    let upstream: Response | null;
    let lastMail: string | null = null;
    if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const fd = await request.formData().catch(() => null);
      const f = fd?.get("form"), file = fd?.get("file");
      if (!isAiForm(f)) throw new BffError(422, "Form tidak dikenal.");
      if (!(file instanceof File) || !file.size) throw new BffError(422, "Pilih berkas PO / PKS.");
      if (file.size > MAX_FILE || !FILE_TYPES.test(file.name)) throw new BffError(422, "Berkas harus PDF, DOCX, PNG atau JPG, maksimal 8 MB.");
      form = f;
      const out = new FormData();
      out.set("form", form);
      out.set("file", file, file.name);
      upstream = await fetch(`${base}/api/agent/extract-file`, {
        method: "POST", headers: { "X-ERP-Delegation": delegation }, body: out,
        signal: AbortSignal.timeout(110_000), cache: "no-store", // a scanned PO is OCR'd: slower than text
      }).catch(() => null);
    } else {
      const body = await request.json().catch(() => null);
      form = isAiForm(body?.form) ? body.form : "opportunity";
      let text = typeof body?.text === "string" ? body.text.trim() : "";
      if (form === "opportunity_update" && !text) {
        if (typeof body?.opportunityId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.opportunityId)) throw new BffError(422, "Opportunity tidak dikenal.");
        ({ text, lastMail } = await updateSource(body.opportunityId));
      }
      if (text.length < 10 || text.length > 12000) throw new BffError(422, "Tempel teksnya (10–12.000 karakter).");
      upstream = await fetch(`${base}/api/agent/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-ERP-Delegation": delegation },
        body: JSON.stringify({ form, text }),
        signal: AbortSignal.timeout(45_000),
        cache: "no-store",
      }).catch(() => null);
    }
    const out = await upstream?.json().catch(() => ({}));
    if (upstream?.status === 422 && typeof out?.detail === "string") throw new BffError(422, out.detail);
    if (!upstream?.ok) throw new BffError(upstream?.status === 503 ? 503 : 502, "AI belum bisa membaca ini; isi form secara manual.");
    const result = normalizeAiResult(out?.fields, form);
    return NextResponse.json({ ...result, lastMail, model: typeof out?.model === "string" ? out.model : null }, { headers });
  } catch (error) {
    if (error instanceof BffError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("agent_extract_failed");
    return NextResponse.json({ error: "AI belum tersedia." }, { status: 503, headers });
  }
}
