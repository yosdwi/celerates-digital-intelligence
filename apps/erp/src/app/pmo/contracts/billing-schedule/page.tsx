import { db } from "@/db";
import { projectMonthlyBillings, projectContracts, opportunities, projectDocuments } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { BillingScheduleTable } from "./billing-schedule-table";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { CalendarRange } from "lucide-react";
import Link from "next/link";
export default async function BillingSchedulePage() {
  const t = await getTranslations("pmo.contracts.billingSchedule");
  const contracts = await db
    .select({
      id: projectContracts.id,
      opportunity_id: projectContracts.opportunity_id,
      opty_no: opportunities.opty_no,
      client_name: opportunities.client_name,
      project_name: opportunities.project_name,
      business_unit_code: opportunities.business_unit_code,
      service_type_code: opportunities.service_type_code,
      sales_type_code: projectContracts.sales_type_code,
      total_value_amount: projectContracts.total_value_amount,
      monthly_value_amount: projectContracts.monthly_value_amount,
      contract_duration_months: projectContracts.contract_duration_months,
      start_date: projectContracts.start_date,
      end_date: projectContracts.end_date,
      notes: projectContracts.notes,
    })
    .from(projectContracts)
    .leftJoin(opportunities, eq(projectContracts.opportunity_id, opportunities.id))
    .orderBy(desc(projectContracts.created_at));

  const docs = await db.select({
    opportunity_id: projectDocuments.opportunity_id,
    po_no: projectDocuments.po_no,
    project_details: projectDocuments.project_details,
  }).from(projectDocuments);
  const docByOpportunity = new Map(docs.filter((d) => d.opportunity_id).map((d) => [d.opportunity_id as string, d]));

  const billingRows = await db
    .select({ id: projectMonthlyBillings.id, contract_id: projectMonthlyBillings.contract_id, month: projectMonthlyBillings.month, amount: projectMonthlyBillings.amount })
    .from(projectMonthlyBillings);

  const enrichedContracts = contracts.map((c) => {
    const doc = c.opportunity_id ? docByOpportunity.get(c.opportunity_id) : undefined;
    return {
      ...c,
      po_no: doc?.po_no ?? null,
      project_details: doc?.project_details || c.notes || c.client_name || "-",
    };
  });

  const totalNilaiKontrak = contracts.reduce((sum, c) => sum + (c.total_value_amount ?? 0), 0);
  const currentYear = new Date().getFullYear();
  const revenueThisYear = billingRows
    .filter((b) => Number(b.month.slice(0, 4)) === currentYear)
    .reduce((sum, b) => sum + b.amount, 0);
  const avgDuration = contracts.length > 0
    ? Math.round(contracts.reduce((s, c) => s + (c.contract_duration_months ?? 0), 0) / contracts.length)
    : 0;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={CalendarRange}
        color="bg-violet-600"
        eyebrow="PMO"
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
      >
        <Link href="/pmo/contracts" className="text-sm font-medium text-violet-700 hover:underline">&larr; {t("backToContract")}</Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t("stats.totalProject")} value={contracts.length} color="navy" />
          <StatCard label={t("stats.totalContractValue")} value={`Rp ${totalNilaiKontrak.toLocaleString("id-ID")}`} color="purple" />
          <StatCard label={t("stats.revenueYear", { year: currentYear })} value={`Rp ${revenueThisYear.toLocaleString("id-ID")}`} color="green" />
          <StatCard label={t("stats.avgDuration")} value={t("monthsShort", { count: avgDuration })} color="blue" />
        </div>

        <BillingScheduleTable contracts={enrichedContracts} billingRows={billingRows} />
      </main>
    </div>
  );
}
