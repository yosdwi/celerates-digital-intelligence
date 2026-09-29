// TM Invoice record, read-first (doc 18 §16): one invoice with its BAST support documents and the PMO → Finance
// handoff, with the contextual actions the ERP already has (submit to Finance; Finance accepts or returns).
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { invoiceDetail } from "@/lib/pmo/mobile-data";
import { fmtDate, fmtMoney, fmtMonth, fmtStamp } from "@/lib/pmo/mobile-format";
import { canWrite, requireDivisionRead } from "@/lib/module-guard";
import { Card, FactRows, MobileScreen, StatusPill, StickyActions, type Tone } from "@/components/mobile/primitives";
import { AskAgentButton, DocumentCard, RecordHeader, Section } from "@/components/mobile/record";
import { FinanceVerify, SubmitToFinance } from "@/components/mobile/pmo/handoff-actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVOICE_TONE: Record<string, Tone> = { overdue: "danger", planned: "muted", submitted: "ok", canceled: "muted" };
const HANDOFF_TONE: Record<string, Tone> = { notified: "accent", received: "ok", needs_revision: "danger", pending: "muted" };

export default async function InvoiceRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  // PMO works the invoice; Finance verifies the handoff. Either division may read it; actions re-check on the server.
  const { levels } = await requireDivisionRead("pmo", "finance");
  const inv = await invoiceDetail(id.toLowerCase());
  if (!inv) notFound();
  const t = await getTranslations("mobile.pmo");
  const locale = await getLocale();
  const status = inv.status ?? "other";
  const handoff = inv.handoff?.status_code ?? "pending";
  const pmoWrite = canWrite(levels.pmo);
  const financeWrite = canWrite(levels.finance) && handoff === "notified";

  return (
    <MobileScreen label={t("invoice.label")} withActions>
      <RecordHeader
        back={{ href: levels.pmo ? "/pmo/invoices" : "/finance", label: levels.pmo ? t("invoices.title") : "Finance" }}
        eyebrow={`PMO · ${t("invoices.title")}`}
        title={inv.client_name ?? "—"}
        subtitle={[t("invoices.serviceMonth", { month: fmtMonth(inv.month, locale) }), inv.opty_no].filter(Boolean).join(" · ")}
        pills={[
          { label: t.has(`invoiceStatus.${status}`) ? t(`invoiceStatus.${status}`) : status, tone: INVOICE_TONE[status] ?? "muted" },
          ...(inv.issue_label ? [{ label: inv.issue_label, tone: "warn" as const }] : []),
        ]}
      />

      {status === "overdue" && inv.stored_status !== "overdue" && (
        <Card className="border-[#f3c7c2] bg-[#fdf1ef] p-3.5 text-[13px] text-[#8a1f16]">{t("invoice.overdueRule")}</Card>
      )}

      <Section id="facts" title={t("invoice.facts")}>
        <FactRows
          rows={[
            { label: t("invoice.serviceMonth"), value: fmtMonth(inv.month, locale) },
            { label: t("invoice.plan"), value: fmtDate(inv.plan, locale) },
            { label: t("invoice.group"), value: inv.group_name ?? inv.client_name ?? "—" },
            { label: t("invoice.value"), value: fmtMoney(inv.price_per_month) },
            { label: t("invoice.submitBast"), value: fmtDate(inv.submit_bast_date, locale) },
          ]}
        />
      </Section>

      <Section id="bast" title={t("invoice.bast")}>
        {!inv.bast_url && inv.bast.length === 0 ? (
          <Card className="p-3.5 text-sm text-j-muted">{t("invoice.noBast")}</Card>
        ) : (
          <div className="flex flex-col gap-2">
            {inv.bast_url && <DocumentCard name="BAST" meta={t("invoice.bastMeta")} value={inv.bast_url} />}
            {inv.bast.map((f) => (
              <DocumentCard key={f.id} name={f.file_name} meta={[f.kind === "link" ? t("invoice.link") : "BAST", f.uploaded_by_name].filter(Boolean).join(" · ")} value={f.url} />
            ))}
          </div>
        )}
      </Section>

      <Section id="handoff" title={t("handoff.title")}>
        <Card className="flex flex-col gap-2 p-3.5 text-sm" data-handoff-state={handoff}>
          <span className="flex items-center justify-between gap-2">
            <span className="font-semibold">{t("handoff.status")}</span>
            <StatusPill tone={HANDOFF_TONE[handoff]}>{t(`handoffStatus.${handoff}`)}</StatusPill>
          </span>
          {inv.handoff?.notified_at && <span className="text-xs text-j-muted">{t("handoff.notifiedBy", { name: inv.handoff.notified_by_name ?? "—", at: fmtStamp(inv.handoff.notified_at, locale) })}</span>}
          {inv.handoff?.received_at && <span className="text-xs text-j-muted">{t("handoff.receivedBy", { name: inv.handoff.received_by_name ?? "—", at: fmtStamp(inv.handoff.received_at, locale) })}</span>}
          {inv.handoff?.finance_notes && <span className="rounded-xl bg-j-line-soft p-2.5 text-[13px]">{inv.handoff.finance_notes}</span>}
          <span className="text-xs text-j-muted">{t("handoff.perProject")}</span>
        </Card>
        {inv.handoff?.doc_url && <DocumentCard name={t("handoff.document")} meta={t("handoff.documentMeta")} value={inv.handoff.doc_url} />}
      </Section>

      {inv.contract && (
        <Section id="contract" title={t("contracts.title")}>
          <Link href={`/pmo/contracts/${inv.contract.id}`} className="flex items-center gap-3 rounded-j-card border border-j-line bg-j-surface p-3.5 shadow-j-card" data-related-contract>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold">{inv.client_name}</span>
              <span className="block text-xs text-j-muted">{`${fmtDate(inv.contract.start_date, locale)} – ${fmtDate(inv.contract.end_date, locale)}`}</span>
            </span>
            <ArrowRight aria-hidden className="h-4 w-4 text-j-faint" />
          </Link>
        </Section>
      )}

      {inv.notes && (
        <Section id="notes" title={t("notes")}>
          <Card className="whitespace-pre-line p-3.5 text-sm">{inv.notes}</Card>
        </Section>
      )}

      <StickyActions>
        <AskAgentButton label={t("askAgentInvoice")} />
        {financeWrite ? (
          <FinanceVerify opportunityId={inv.opportunity_id} />
        ) : pmoWrite && handoff !== "received" && handoff !== "notified" ? (
          <SubmitToFinance opportunityId={inv.opportunity_id} invoiceId={inv.id} docUrl={inv.handoff?.doc_url ?? null} resubmit={handoff === "needs_revision"} />
        ) : null}
      </StickyActions>
    </MobileScreen>
  );
}
