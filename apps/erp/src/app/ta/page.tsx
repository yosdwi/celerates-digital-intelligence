import { db } from "@/db";
import { requisitions, opportunities } from "@/db/schema";
import { desc, eq, or } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { createRequisition } from "./actions";
import { DeleteRequisitionButton } from "./delete-requisition-button";
import Link from "next/link";
import { ExpandableSection } from "@/components/expandable-section";
import { TableControls } from "@/components/table-controls";
import { RequisitionsTable } from "./requisitions-table";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Users, RefreshCw } from "lucide-react";
import { AddRecordModal } from "@/components/add-record-modal";
import { Field, SelectField } from "@/components/form-fields";

const SERVICE_TYPES = [
  ["outsourcing", "Outsourcing"], ["headhunting", "Headhunting"], ["outplacement", "Outplacement"],
  ["managed_service", "Managed Service"], ["project_based", "Project Based"], ["rpo", "RPO"],
  ["training", "Training"], ["license", "License"], ["hardware", "Hardware"], ["replacement", "Replacement"],
] as const;
const LEVELS = [
  ["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"],
  ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"],
] as const;
const OPTY_STATUS = [
  ["on_hold", "Project on Hold"], ["client_not_responding", "Client Not Responding"],
  ["lost_pitching", "Lost on Pitching Period"], ["waiting_feedback", "Waiting for Feedback"],
  ["budget_on_hold", "Client Budget on Hold"], ["won", "Project Won"],
  ["closed_lost", "Closed Lost"], ["on_going_others", "Opty on Going Others"],
] as const;
const PRIORITIES = [["p0", "P0"], ["p1", "P1"], ["p2", "P2"], ["p3", "P3"]] as const;

export default async function TAPage() {
  const t = await getTranslations("ta.requisitions");
  const data = await db
    .select({
      id: requisitions.id,
      requisition_no: requisitions.requisition_no,
      opty_request_date: requisitions.opty_request_date,
      client_name: requisitions.client_name,
      position_name: requisitions.position_name,
      service_type_code: requisitions.service_type_code,
      level_code: requisitions.level_code,
      opty_status_code: requisitions.opty_status_code,
      headcount_target: requisitions.headcount_target,
      priority_code: requisitions.priority_code,
      price_amount: requisitions.price_amount,
      estimated_duration_months: requisitions.estimated_duration_months,
      ta_pic_name: requisitions.ta_pic_name,
      sales_pic_name: requisitions.sales_pic_name,
      notes: requisitions.notes,
      created_at: requisitions.created_at,
      opty_no: opportunities.opty_no,
    })
    .from(requisitions)
    .leftJoin(
      opportunities,
      or(
        eq(requisitions.opportunity_id, opportunities.opportunity_tracker_id),
        eq(requisitions.opportunity_id, opportunities.id)
      )
    )
    .orderBy(desc(requisitions.created_at));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen">
      <PageHeader
          icon={Users}
          color="bg-orange-500"
          eyebrow="Talent Acquisition"
          title="Requisition"
          subtitle={t("subtitle")}
        >
          <Link
            href="/ta/sheet-sync"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Google Sheet Sync
          </Link>
        </PageHeader>

        <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total Requisition" value={data.length} color="navy" />
            <StatCard label="Won" value={data.filter((d) => d.opty_status_code === "won").length} color="green" />
            <StatCard label="Total Headcount" value={data.reduce((sum, d) => sum + (d.headcount_target ?? 0), 0)} color="orange" />
            <StatCard label="Priority P0" value={data.filter((d) => d.priority_code === "p0").length} color="red" />
          </div>

          <div className="flex justify-end">
            <AddRecordModal buttonLabel={t("addNew")} title={t("addNew")} action={createRequisition}>
              <Field label="Opty Request Date" name="opty_request_date" type="date" defaultValue={today} />
              <Field label={t("clientName")} name="client_name" required />
              <Field label="Positions" name="position_name" required />

              <SelectField label="Services Type" name="service_type_code" options={SERVICE_TYPES} />
              <SelectField label="Level" name="level_code" options={LEVELS} />
              <SelectField label="Opty Status" name="opty_status_code" options={OPTY_STATUS} />

              <Field label="Headcount" name="headcount_target" type="number" />
              <SelectField label="Opty Priority" name="priority_code" options={PRIORITIES} />
              <Field label="Price" name="price_amount" money />
              <Field label="Estimasi Durasi (bulan)" name="estimated_duration_months" type="number" />

              <Field label="TA PIC" name="ta_pic_name" required />
              <Field label="Sales PIC" name="sales_pic_name" hint={t("salesPicHint")} />
              <div className="sm:col-span-1">
                <Field label="Details" name="notes" textarea />
              </div>
            </AddRecordModal>
          </div>

          <ExpandableSection title={t("listTitle", { count: data.length })}>
            <RequisitionsTable data={data} />
          </ExpandableSection>
        </main>
    </div>
  );
}
