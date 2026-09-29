import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { crmClients, crmClientContacts, crmClientActivities } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Building2, Phone, Mail, Calendar, FileText, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Avatar } from "@/components/avatar";
import { Pill, type PillVariant } from "@/components/pill";
import { getAccountStatsMap, getAccountHistory } from "@/lib/crm";
import { AddActivityModal } from "./add-activity-modal";
import { AddContactModal } from "./add-contact-modal";
import { DeleteContactButton } from "./delete-contact-button";
import { DeleteActivityButton } from "./delete-activity-button";
import { AccountModalsProvider } from "./account-modals-context";

const STATUS_LABELS: Record<string, string> = { active: "Active", prospect: "Prospect", dormant: "Dormant" };
const STATUS_VARIANT: Record<string, PillVariant> = { active: "success", prospect: "warning", dormant: "neutral" };
const TYPE_ICON: Record<string, typeof Phone> = { call: Phone, email: Mail, meeting: Calendar, note: FileText };
const TYPE_GRADIENT: Record<string, string> = {
  call: "linear-gradient(135deg,#2563eb,#60a5fa)",
  email: "linear-gradient(135deg,#7c3aed,#a78bfa)",
  meeting: "linear-gradient(135deg,#059669,#34d399)",
  note: "linear-gradient(135deg,#b45309,#fbbf24)",
};
const PIPELINE_LABELS: Record<string, string> = { win: "Win", drop: "Drop", hold: "Hold", on_going: "On Going" };
const INVOICE_STATUS_VARIANT: Record<string, PillVariant> = { overdue: "critical", submitted: "success", planned: "neutral" };

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("crm");
  const { id } = await params;

  const [client] = await db.select().from(crmClients).where(eq(crmClients.id, id));
  if (!client) notFound();

  const [contacts, activities, statsMap, history] = await Promise.all([
    db.select().from(crmClientContacts).where(eq(crmClientContacts.client_id, id)).orderBy(desc(crmClientContacts.is_primary)),
    db.select().from(crmClientActivities).where(eq(crmClientActivities.client_id, id)).orderBy(desc(crmClientActivities.activity_date)),
    getAccountStatsMap([client.name]),
    getAccountHistory(client.name),
  ]);
  const stats = statsMap.get(client.name);

  return (
    <div className="min-h-screen">
      <PageHeader icon={Building2} color="bg-blue-500" eyebrow="CRM · Account" title={client.name} subtitle={client.industry ?? t("noIndustry")}>
        <Link href="/sales/accounts" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("backToAccountList")}
        </Link>
        <Pill variant={STATUS_VARIANT[client.status_code] ?? "neutral"}>{STATUS_LABELS[client.status_code] ?? client.status_code}</Pill>
      </PageHeader>

      <main className="px-8 py-8 space-y-6 max-w-7xl mx-auto">
        <AccountModalsProvider>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t("statTotalLeads")} value={stats?.leadCount ?? 0} color="indigo" />
          <StatCard label={t("statTotalOpportunity")} value={stats?.opportunityCount ?? 0} color="blue" />
          <StatCard label={t("statTotalContract")} value={stats?.contractCount ?? 0} color="green" />
          <StatCard label={t("statTotalInvoice")} value={stats?.invoiceCount ?? 0} color="amber" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
          <div className="lg:col-span-3 rounded-2xl border border-white/70 bg-white/78 backdrop-blur-xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_32px_-16px_rgba(15,23,42,0.12)] p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-slate-800">{t("activityTimeline")}</p>
              <AddActivityModal clientId={id} contactOptions={contacts.map((c) => ({ id: c.id, name: c.name }))} />
            </div>

            {activities.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">{t("noActivitiesYet")}</p>
            ) : (
              <div className="relative pl-9">
                <div className="absolute left-[15px] top-1.5 bottom-1.5 w-px bg-slate-200" />
                <div className="space-y-5">
                  {activities.map((a) => {
                    const Icon = TYPE_ICON[a.type_code] ?? FileText;
                    return (
                      <div key={a.id} className="relative">
                        <span
                          className="absolute -left-9 top-0 h-8 w-8 rounded-[10px] flex items-center justify-center shadow-[0_6px_14px_-6px_rgba(15,23,42,0.4)]"
                          style={{ backgroundImage: TYPE_GRADIENT[a.type_code] ?? TYPE_GRADIENT.note }}
                        >
                          <Icon className="h-3.5 w-3.5 text-white" />
                        </span>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-slate-400 whitespace-nowrap">{a.activity_date}</span>
                            <DeleteActivityButton activityId={a.id} clientId={id} />
                          </div>
                        </div>
                        {a.description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{a.description}</p>}
                        {a.created_by_name && <p className="text-[11px] text-slate-400 mt-1.5">{t("byLabel")} {a.created_by_name}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-white/70 bg-white/78 backdrop-blur-xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_32px_-16px_rgba(15,23,42,0.12)] p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-slate-800">{t("contactPic")}</p>
              <AddContactModal clientId={id} />
            </div>

            {contacts.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">{t("noContactsYet")}</p>
            ) : (
              <div className="space-y-4">
                {contacts.map((c) => (
                  <div key={c.id} className="flex items-start gap-3 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                    <Avatar name={c.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                        {c.is_primary && <Pill variant="info">{t("primary")}</Pill>}
                      </div>
                      {c.role_title && <p className="text-xs text-slate-500 mt-0.5">{c.role_title}</p>}
                      {(c.email || c.phone) && (
                        <p className="text-[11px] text-slate-400 mt-1">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>
                      )}
                    </div>
                    <DeleteContactButton contactId={c.id} clientId={id} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_32px_-16px_rgba(15,23,42,0.12)] overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4 bg-white/60">
            <p className="text-sm font-semibold text-slate-800">{t("relatedHistory")}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            <div className="p-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2.5">{t("leadsLabel", { count: history.leads.length })}</p>
              {history.leads.length === 0 ? (
                <p className="text-xs text-slate-300">{t("noneLabel")}</p>
              ) : (
                <div className="space-y-2">
                  {history.leads.map((l) => (
                    <div key={l.id} className="flex justify-between items-center text-xs">
                      <span className="text-slate-700">{l.lead_no} {l.project_name ? `· ${l.project_name}` : ""}</span>
                      {l.is_qualified === true ? <Pill variant="success">Qualified</Pill> : l.is_qualified === false ? <Pill variant="critical">Disqualified</Pill> : <Pill variant="neutral">Review</Pill>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2.5">{t("opportunitiesLabel", { count: history.opportunities.length })}</p>
              {history.opportunities.length === 0 ? (
                <p className="text-xs text-slate-300">{t("noneLabel")}</p>
              ) : (
                <div className="space-y-2">
                  {history.opportunities.map((o) => (
                    <div key={o.id} className="flex justify-between items-center text-xs">
                      <span className="text-slate-700">{o.opty_no} {o.price_amount ? `· Rp ${o.price_amount.toLocaleString("id-ID")}` : ""}</span>
                      <Pill variant={o.pipeline_stage_code === "win" ? "success" : o.pipeline_stage_code === "drop" ? "critical" : "info"}>{PIPELINE_LABELS[o.pipeline_stage_code] ?? o.pipeline_stage_code}</Pill>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2.5">{t("contractsLabel", { count: history.contracts.length })}</p>
              {history.contracts.length === 0 ? (
                <p className="text-xs text-slate-300">{t("noneLabel")}</p>
              ) : (
                <div className="space-y-2">
                  {history.contracts.map((c) => (
                    <div key={c.id} className="flex justify-between items-center text-xs">
                      <span className="text-slate-700">{c.contract_duration_months ? `${c.contract_duration_months} bulan` : "-"}</span>
                      <span className="text-slate-400">{c.start_date ?? "-"} s/d {c.end_date ?? "-"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2.5">{t("invoicesLabel", { count: history.invoices.length })}</p>
              {history.invoices.length === 0 ? (
                <p className="text-xs text-slate-300">{t("noneLabel")}</p>
              ) : (
                <div className="space-y-2">
                  {history.invoices.map((inv) => (
                    <div key={inv.id} className="flex justify-between items-center text-xs">
                      <span className="text-slate-700">{inv.group_name ?? "-"} {inv.price_per_month ? `· Rp ${inv.price_per_month.toLocaleString("id-ID")}` : ""}</span>
                      <Pill variant={INVOICE_STATUS_VARIANT[inv.status_code ?? ""] ?? "neutral"}>{inv.status_code ?? "-"}</Pill>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        </AccountModalsProvider>
      </main>
    </div>
  );
}
