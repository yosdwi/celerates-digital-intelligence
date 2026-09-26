import { db } from "@/db";
import { projectContracts, opportunities } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { createProjectContract } from "../actions";
import { OpportunityPicker } from "@/components/opportunity-picker";
import { ContractsTable } from "./contracts-table";
import { ExpandableSection } from "@/components/expandable-section";
import Link from "next/link";
import { RefreshCw, FileSignature } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AddRecordModal } from "@/components/add-record-modal";
import { PendingContractSetups } from "../pending-contract-setups";
import { getPendingContractSetups } from "@/lib/pq-approval";
import { Field, SelectField } from "@/components/form-fields";

export default async function ContractsPage() {
  const t = await getTranslations("pmo.contracts.page");
  const [data, opportunityOptions, pendingContractSetups] = await Promise.all([
    db
      .select({
        id: projectContracts.id,
        opty_no: opportunities.opty_no,
        client_name: opportunities.client_name,
        position_name: opportunities.position_name,
        sales_pic_name: opportunities.sales_pic_name,
        service_type_code: opportunities.service_type_code,
        sales_type_code: projectContracts.sales_type_code,
        monthly_value_amount: projectContracts.monthly_value_amount,
        total_value_amount: projectContracts.total_value_amount,
        contract_duration_months: projectContracts.contract_duration_months,
        start_date: projectContracts.start_date,
        end_date: projectContracts.end_date,
        notes: projectContracts.notes,
        created_at: projectContracts.created_at,
      })
      .from(projectContracts)
      .leftJoin(opportunities, eq(projectContracts.opportunity_id, opportunities.id))
      .orderBy(desc(projectContracts.created_at)),
    db.select({
      id: opportunities.id,
      opty_no: opportunities.opty_no,
      client_name: opportunities.client_name,
      position_name: opportunities.position_name,
      sales_pic_name: opportunities.sales_pic_name,
      service_type_code: opportunities.service_type_code,
      client_type_code: opportunities.client_type_code,
      price_amount: opportunities.price_amount,
      start_date: opportunities.start_date,
      end_date: opportunities.end_date,
    }).from(opportunities),
    getPendingContractSetups(),
  ]);

  const totalValue = data.reduce((sum, d) => sum + (d.total_value_amount ?? 0), 0);
  const totalMonthly = data.reduce((sum, d) => sum + (d.monthly_value_amount ?? 0), 0);

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={FileSignature}
        color="bg-purple-500"
        eyebrow="PMO"
        title="A.Contract"
        subtitle={t("subtitle")}
      >
        <Link
          href="/pmo/contracts/sheet-sync"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("googleSheetSync")}
        </Link>
        <Link href="/pmo/contracts/billing-schedule" className="text-xs text-brand-500 hover:underline">
          {t("viewMonthlyBillingSchedule")} &rarr;
        </Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t("stats.totalContract")} value={data.length} color="navy" />
          <StatCard label={t("stats.totalValue")} value={`Rp ${totalValue.toLocaleString("id-ID")}`} color="green" />
          <StatCard label={t("stats.totalPerMonth")} value={`Rp ${totalMonthly.toLocaleString("id-ID")}`} color="blue" />
          <StatCard label={t("stats.avgDuration")} value={data.length > 0 ? t("monthsShort", { count: Math.round(data.reduce((s, d) => s + (d.contract_duration_months ?? 0), 0) / data.length) }) : "-"} color="purple" />
        </div>

        <PendingContractSetups items={pendingContractSetups} />

        <div className="flex justify-end">
          <AddRecordModal buttonLabel={t("addContract")} title={t("addContract")} action={createProjectContract}>
            <OpportunityPicker opportunities={opportunityOptions} withContractFields />

            <div className="sm:col-span-3">
              <Field label="Notes" name="notes" textarea />
            </div>
          </AddRecordModal>
        </div>

        <ExpandableSection title={t("contractListTitle", { count: data.length })}>
          <ContractsTable data={data} />
        </ExpandableSection>
      </main>
    </div>
  );
}
