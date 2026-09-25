import { invoiceStatusExpression } from "@/lib/invoice-status";
import { db } from "@/db";
import { financeDocumentHandoffs, opportunities, projectInvoices } from "@/db/schema";
import { eq, ne, sql } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { SmartFileLink } from "@/components/smart-file-link";
import { HandoffActionPanel } from "./handoff-action-panel";
import { Landmark } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function FinancePage() {
  const t = await getTranslations("finance");
  const session = await getServerSession(authOptions);
  const isOwner = Boolean((session?.user as any)?.isOwner);
  const access = ((session?.user as any)?.access ?? []) as { divisionKey: string; level: string }[];
  const canVerify = isOwner || access.some((a) => a.divisionKey === "finance");

  const invoiceCounts = await db
    .select({
      opportunity_id: projectInvoices.opportunity_id,
      overdue_count: sql<number>`count(*) filter (where ${invoiceStatusExpression()} = 'overdue')`,
      total_count: sql<number>`count(*)`,
    })
    .from(projectInvoices)
    .groupBy(projectInvoices.opportunity_id);

  const overdueByOpportunity = new Map(invoiceCounts.map((r) => [r.opportunity_id, Number(r.overdue_count)]));
  const invoiceCountByOpportunity = new Map(invoiceCounts.map((r) => [r.opportunity_id, Number(r.total_count)]));

  const rows = await db
    .select({
      id: financeDocumentHandoffs.id,
      opportunity_id: financeDocumentHandoffs.opportunity_id,
      opty_no: opportunities.opty_no,
      client_name: opportunities.client_name,
      project_name: opportunities.project_name,
      doc_url: financeDocumentHandoffs.doc_url,
      status_code: financeDocumentHandoffs.status_code,
      notified_at: financeDocumentHandoffs.notified_at,
      notified_by_name: financeDocumentHandoffs.notified_by_name,
      notes: financeDocumentHandoffs.notes,
      received_at: financeDocumentHandoffs.received_at,
      received_by_name: financeDocumentHandoffs.received_by_name,
      finance_notes: financeDocumentHandoffs.finance_notes,
    })
    .from(financeDocumentHandoffs)
    .leftJoin(opportunities, eq(financeDocumentHandoffs.opportunity_id, opportunities.id))
    // Cuma yang udah pernah di-"Kasih Tau Finance" oleh PMO -- row yang baru
    // "Simpan Link" (status masih "pending") belum boleh masuk ke list Finance.
    .where(ne(financeDocumentHandoffs.status_code, "pending"))
    .orderBy(financeDocumentHandoffs.notified_at);

  const receivedCount = rows.filter((r) => r.status_code === "received").length;
  const needsRevisionCount = rows.filter((r) => r.status_code === "needs_revision").length;
  const waitingReviewCount = rows.filter((r) => r.status_code === "notified").length;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Landmark}
        color="bg-emerald-600"
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t("statTotalProject")} value={rows.length} color="navy" />
          <StatCard label={t("statNeedsReview")} value={waitingReviewCount} color="amber" />
          <StatCard label={t("statReceived")} value={receivedCount} color="green" />
          <StatCard label={t("statReturned")} value={needsRevisionCount} color="red" />
        </div>

        <section className="rounded-2xl border border-teal-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-teal-100 bg-teal-50/40">
            <h2 className="text-sm font-semibold text-slate-700">{t("documentListTitle", { count: rows.length })}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{t("documentListSubtitle")}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-teal-200 bg-teal-50 text-left text-xs font-semibold uppercase tracking-wide text-teal-700">
                  <th className="px-4 py-3 min-w-[220px]">{t("verification")}</th>
                  <th className="px-4 py-3 min-w-[130px]">{t("optyId")}</th>
                  <th className="px-4 py-3 min-w-[150px]">Client</th>
                  <th className="px-4 py-3 min-w-[150px]">Project</th>
                  <th className="px-4 py-3 min-w-[100px]">{t("invoice")}</th>
                  <th className="px-4 py-3 min-w-[130px]">{t("document")}</th>
                  <th className="px-4 py-3 min-w-[130px]">{t("handedOver")}</th>
                  <th className="px-4 py-3 min-w-[130px]">{t("byPmo")}</th>
                  <th className="px-4 py-3 min-w-[180px]">{t("pmoNotes")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const overdue = overdueByOpportunity.get(r.opportunity_id) ?? 0;
                  const totalInvoices = invoiceCountByOpportunity.get(r.opportunity_id) ?? 0;
                  return (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-teal-50/30">
                      <td className="px-4 py-3">
                        <HandoffActionPanel
                          opportunityId={r.opportunity_id}
                          statusCode={r.status_code}
                          receivedByName={r.received_by_name}
                          receivedAt={r.received_at ? new Date(r.received_at).toLocaleDateString("id-ID") : null}
                          financeNotes={r.finance_notes}
                          canVerify={canVerify}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.opty_no ?? "-"}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{r.client_name ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{r.project_name ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {totalInvoices} {t("rows")}{overdue > 0 && <span className="ml-1 text-red-600 font-medium">({overdue} overdue)</span>}
                      </td>
                      <td className="px-4 py-3"><SmartFileLink value={r.doc_url} /></td>
                      <td className="px-4 py-3 text-slate-600">{r.notified_at ? new Date(r.notified_at).toLocaleDateString("id-ID") : "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{r.notified_by_name ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{r.notes ?? "-"}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={9} className="px-6 py-10 text-center text-slate-400">{t("noHandoffs")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
