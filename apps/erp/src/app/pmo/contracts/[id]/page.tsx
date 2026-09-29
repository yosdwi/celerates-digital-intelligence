// A.Contract record, read-first (doc 18 §16): the mobile-native detail of one PMO contract, grouped into the
// sections PMO works through — period, commercial facts, project and talent, billing schedule, TM Invoice,
// documents and the Finance handoff. Editing stays on the desktop form (/edit).
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { contractDetail } from "@/lib/pmo/mobile-data";
import { fmtDate, fmtMoney, fmtMonth, fmtStamp } from "@/lib/pmo/mobile-format";
import { canWrite, requireDivisionRead } from "@/lib/module-guard";
import { followUpLabel } from "@/components/mobile/pmo/lists";
import { Card, FactRows, MobileScreen, StatusPill, StickyActions, type Tone } from "@/components/mobile/primitives";
import { buttonClass } from "@/components/mobile/styles";
import { AskAgentButton, DocumentCard, ProgressMeter, RecordHeader, Section } from "@/components/mobile/record";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_TONE: Record<string, Tone> = { active: "ok", ending: "warn", ended: "muted", upcoming: "accent", undated: "muted" };
const INVOICE_TONE: Record<string, Tone> = { overdue: "danger", planned: "muted", submitted: "ok", canceled: "muted" };
const HANDOFF_TONE: Record<string, Tone> = { notified: "accent", received: "ok", needs_revision: "danger", pending: "muted" };
const DOC_TONE: Record<string, Tone> = { done_softcopy: "ok", done_hardcopy: "ok", on_progress: "accent", need_fu_hardcopy: "warn", need_fu_softcopy: "warn", none: "muted" };
const DOC_KEY: Record<string, string> = { done_softcopy: "doneSoftcopy", done_hardcopy: "doneHardcopy", on_progress: "onProgress", need_fu_hardcopy: "needFuHardcopy", need_fu_softcopy: "needFuSoftcopy", none: "none" };

export default async function ContractRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { levels } = await requireDivisionRead("pmo");
  const c = await contractDetail(id.toLowerCase());
  if (!c) notFound();
  const t = await getTranslations("mobile.pmo");
  const tDoc = await getTranslations("pmo.docStatus");
  const locale = await getLocale();
  const follow = await followUpLabel(c.follow_up);
  const invoiceStatus = (s: string | null) => (s && t.has(`invoiceStatus.${s}`) ? t(`invoiceStatus.${s}`) : s ?? "—");

  return (
    <MobileScreen label={t("contract.label")} withActions>
      <RecordHeader
        back={{ href: "/pmo/contracts", label: t("contracts.title") }}
        eyebrow={`PMO · ${t("contracts.title")}`}
        title={c.client_name ?? "—"}
        subtitle={[c.position_name, c.opty_no].filter(Boolean).join(" · ")}
        pills={[
          { label: c.status === "ending" ? t("status.ending", { days: c.days_left ?? 0 }) : t(`status.${c.status}`), tone: STATUS_TONE[c.status] },
          ...(follow ? [follow] : []),
        ]}
      />

      <Section id="period" title={t("contract.period")}>
        {c.progress !== null && <ProgressMeter value={c.progress} from={fmtDate(c.start_date, locale)} to={fmtDate(c.end_date, locale)} label={t("contract.elapsed")} />}
        <FactRows
          rows={[
            { label: t("contract.start"), value: fmtDate(c.start_date, locale) },
            { label: t("contract.end"), value: fmtDate(c.end_date, locale) },
            { label: t("contract.duration"), value: c.months ? t("months", { count: c.months }) : "—" },
          ]}
        />
      </Section>

      <Section id="commercial" title={t("contract.commercial")}>
        <FactRows
          rows={[
            { label: t("contract.monthly"), value: fmtMoney(c.monthly_value_amount) },
            { label: t("contract.total"), value: fmtMoney(c.total_value_amount) },
            { label: t("contract.salesType"), value: c.sales_type_code ?? "—" },
            { label: t("contract.pq"), value: c.pq_no ?? "—" },
          ]}
        />
      </Section>

      <Section id="project" title={t("contract.project")}>
        <FactRows
          rows={[
            { label: t("contract.projectName"), value: c.project_name ?? "—" },
            { label: t("contract.service"), value: c.service_type_code ?? "—" },
            { label: t("contract.salesPic"), value: c.sales_pic_name ?? "—" },
            { label: t("contract.headcount"), value: c.headcount_target ?? "—" },
          ]}
        />
        {c.talents.length > 0 && (
          <Card className="px-3.5 py-1">
            <ul className="divide-y divide-j-line-soft" aria-label={t("contract.talents")}>
              {c.talents.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block font-semibold">{a.employee_no}</span>
                    <span className="block truncate text-xs text-j-muted">{[a.position_name, `${fmtDate(a.start_date, locale)} – ${fmtDate(a.end_date, locale)}`].filter(Boolean).join(" · ")}</span>
                  </span>
                  {a.status && <StatusPill tone={a.status === "ended" ? "muted" : "ok"}>{a.status}</StatusPill>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>

      <Section id="billing" title={t("contract.billing")}>
        {c.billings.length === 0 ? (
          <Card className="p-3.5 text-sm text-j-muted">{t("contract.noBilling")}</Card>
        ) : (
          <Card className="px-3.5 py-1">
            <ul className="divide-y divide-j-line-soft">
              {c.billings.map((b) => (
                <li key={b.month}>
                  {b.invoice ? (
                    <Link href={`/pmo/invoices/${b.invoice.id}`} className="flex min-h-[52px] items-center gap-3 py-2 text-sm" data-billing-month={b.month}>
                      <span className="flex-1 font-semibold">{fmtMonth(b.month, locale)}</span>
                      <span className="text-j-muted">{fmtMoney(b.amount)}</span>
                      <StatusPill tone={INVOICE_TONE[b.invoice.status ?? ""] ?? "muted"}>{invoiceStatus(b.invoice.status)}</StatusPill>
                    </Link>
                  ) : (
                    <div className="flex min-h-[52px] items-center gap-3 py-2 text-sm" data-billing-month={b.month}>
                      <span className="flex-1 font-semibold">{fmtMonth(b.month, locale)}</span>
                      <span className="text-j-muted">{fmtMoney(b.amount)}</span>
                      <StatusPill tone="warn">{t("contract.noInvoice")}</StatusPill>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>

      <Section id="invoices" title={t("invoices.title")} action={<Link href={`/pmo/invoices?q=${encodeURIComponent(c.opty_no ?? "")}`} className="text-[13px] font-semibold text-j-accent">{t("seeAll")}</Link>}>
        {c.invoices.length === 0 ? (
          <Card className="p-3.5 text-sm text-j-muted">{t("contract.noInvoices")}</Card>
        ) : (
          <Card className="px-3.5 py-1">
            <ul className="divide-y divide-j-line-soft">
              {c.invoices.map((i) => (
                <li key={i.id}>
                  <Link href={`/pmo/invoices/${i.id}`} className="flex min-h-[52px] items-center gap-3 py-2 text-sm" data-related-invoice={i.id}>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{fmtMonth(i.month, locale)}</span>
                      {i.issue_label && <span className="block truncate text-xs text-j-muted">{i.issue_label}</span>}
                    </span>
                    <StatusPill tone={INVOICE_TONE[i.status ?? ""] ?? "muted"}>{invoiceStatus(i.status)}</StatusPill>
                    <ArrowRight aria-hidden className="h-4 w-4 text-j-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>

      <Section id="documents" title={t("contract.documents")}>
        {c.documents.length === 0 ? (
          <Card className="p-3.5 text-sm text-j-muted">{t("contract.noDocuments")}</Card>
        ) : (
          <div className="flex flex-col gap-2">
            {c.documents.map((d) => (
              <div key={d.key} className="flex flex-col gap-2">
                <DocumentCard
                  name={`${d.kind}${d.no ? ` · ${d.no}` : ""}`}
                  meta={t("contract.documentMeta")}
                  value={d.url}
                  pill={d.status ? { label: DOC_KEY[d.status] ? tDoc(DOC_KEY[d.status]) : d.status, tone: DOC_TONE[d.status] ?? "warn" } : null}
                />
                {d.files.map((f) => (
                  <DocumentCard key={f.id} name={f.file_name} meta={`${d.kind} · ${f.uploaded_by_name ?? ""}`} value={f.url} />
                ))}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section id="handoff" title={t("handoff.title")}>
        <Card className="flex flex-col gap-1.5 p-3.5 text-sm">
          <span className="flex items-center justify-between gap-2">
            <span className="font-semibold">{t("handoff.status")}</span>
            <StatusPill tone={HANDOFF_TONE[c.handoff?.status_code ?? "pending"]}>{t(`handoffStatus.${c.handoff?.status_code ?? "pending"}`)}</StatusPill>
          </span>
          {c.handoff?.notified_at && <span className="text-xs text-j-muted">{t("handoff.notifiedBy", { name: c.handoff.notified_by_name ?? "—", at: fmtStamp(c.handoff.notified_at, locale) })}</span>}
          {c.handoff?.finance_notes && <span className="text-[13px]">{c.handoff.finance_notes}</span>}
          <span className="text-xs text-j-muted">{t("handoff.perProject")}</span>
        </Card>
      </Section>

      {c.notes && (
        <Section id="notes" title={t("notes")}>
          <Card className="whitespace-pre-line p-3.5 text-sm">{c.notes}</Card>
        </Section>
      )}

      <StickyActions>
        <AskAgentButton label={t("askAgent")} />
        <Link href={`/pmo/invoices?q=${encodeURIComponent(c.opty_no ?? "")}`} className={buttonClass.primary}>
          {t("invoices.title")}
        </Link>
      </StickyActions>
      {canWrite(levels.pmo) && (
        <Link href={`/pmo/contracts/${c.id}/edit`} className="hidden text-sm font-semibold text-j-accent md:block">
          {t("editDesktop")}
        </Link>
      )}
    </MobileScreen>
  );
}
