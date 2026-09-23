import { db } from "@/db";
import { projectContracts, projectInvoices, projectDocuments } from "@/db/schema";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DashboardCard, BarChart, DonutChart, ProgressRing, AreaTrendChart, monthlyTrend, countBy } from "@/components/dashboard-charts";
import { LayoutDashboard } from "lucide-react";
import Link from "next/link";

export default async function PmoDashboardPage() {
  const t = await getTranslations("pmo");
  const [contractRows, invoiceRows, documentRows] = await Promise.all([
    db.select().from(projectContracts),
    db.select().from(projectInvoices),
    db.select().from(projectDocuments),
  ]);

  const totalContractValue = contractRows.reduce((sum, c) => sum + (c.total_value_amount ?? 0), 0);
  const totalMonthlyValue = contractRows.reduce((sum, c) => sum + (c.monthly_value_amount ?? 0), 0);
  const overdueInvoices = invoiceRows.filter((i) => i.status_code === "overdue").length;
  const docsComplete = documentRows.filter(
    (d) => (d.pks_status_code === "done_softcopy" || d.pks_status_code === "done_hardcopy") &&
      (d.po_status_code === "done_softcopy" || d.po_status_code === "done_hardcopy")
  ).length;

  const docsCompleteRate = documentRows.length > 0 ? Math.round((docsComplete / documentRows.length) * 100) : 0;

  const byInvoiceStatus = countBy(invoiceRows, (i) => i.status_code);
  const byContractSalesType = countBy(contractRows, (c) => c.sales_type_code);

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={LayoutDashboard}
        color="bg-violet-500"
        eyebrow="PMO"
        title={t("dashboardTitle")}
        subtitle={t("dashboardSubtitle")}
      >
        <Link href="/pmo/contracts" className="text-xs text-brand-500 hover:underline">A.Contract &rarr;</Link>
        <Link href="/pmo/invoices" className="text-xs text-brand-500 hover:underline">TM Invoice &rarr;</Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t("statTotalContractValue")} value={`Rp ${totalContractValue.toLocaleString("id-ID")}`} color="green" />
          <StatCard label={t("statMonthlyTotal")} value={`Rp ${totalMonthlyValue.toLocaleString("id-ID")}`} color="blue" />
          <StatCard label={t("statOverdueInvoice")} value={overdueInvoices} color="red" />
          <StatCard label={t("statCompleteDocuments")} value={`${docsComplete}/${documentRows.length}`} color="purple" />
        </div>

        <DashboardCard title={t("newContractTrendTitle")} subtitle={t("last6Months")}>
          <AreaTrendChart items={monthlyTrend(contractRows.map((c) => c.created_at))} accent="violet" />
        </DashboardCard>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <DashboardCard title={t("documentCompletenessTitle")} subtitle={t("documentCompletenessSubtitle")}>
            <ProgressRing percent={docsCompleteRate} label={t("documentCompletenessLabel", { done: docsComplete, total: documentRows.length })} />
          </DashboardCard>
          <DashboardCard title={t("invoiceByStatusTitle")} subtitle={t("invoiceByStatusSubtitle")}>
            <DonutChart items={byInvoiceStatus} />
          </DashboardCard>
          <DashboardCard title={t("contractBySalesTypeTitle")} subtitle={t("contractBySalesTypeSubtitle")}>
            <BarChart items={byContractSalesType} />
          </DashboardCard>
        </div>
      </main>
    </div>
  );
}
