import { db } from "@/db";
import { extensionIncrementRequests, employees, onboardingRequests, candidates, extensionRequestSpecialNotes } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ExpandableSection } from "@/components/expandable-section";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ClipboardCheck } from "lucide-react";
import { ExtensionRequestsTable } from "./extension-requests-table";
import { getTranslations } from "next-intl/server";

export default async function HrExtensionRequestsPage() {
  const t = await getTranslations("hr.extensionRequests.page");
  const [rows, allSpecialNotes] = await Promise.all([
    db
      .select({
        id: extensionIncrementRequests.id,
        employee_id: extensionIncrementRequests.employee_id,
        employee_no: employees.employee_no,
        candidate_name: candidates.candidate_name,
        propose_start_date: extensionIncrementRequests.propose_start_date,
        propose_end_date: extensionIncrementRequests.propose_end_date,
        proposed_position_name: extensionIncrementRequests.proposed_position_name,
        proposed_employment_type_code: extensionIncrementRequests.proposed_employment_type_code,
        requester_name: extensionIncrementRequests.requester_name,
        approved_by_1_name: extensionIncrementRequests.approved_by_1_name,
        approved_by_2_name: extensionIncrementRequests.approved_by_2_name,
        approved_by_3_name: extensionIncrementRequests.approved_by_3_name,
        acknowledged_by_name: extensionIncrementRequests.acknowledged_by_name,
        status_code: extensionIncrementRequests.status_code,
        hr_status_code: extensionIncrementRequests.hr_status_code,
        employment_contract_id: extensionIncrementRequests.employment_contract_id,
      })
      .from(extensionIncrementRequests)
      .leftJoin(employees, eq(extensionIncrementRequests.employee_id, employees.id))
      .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
      .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
      .where(eq(extensionIncrementRequests.status_code, "approved"))
      .orderBy(desc(extensionIncrementRequests.created_at)),
    db.select({ extension_request_id: extensionRequestSpecialNotes.extension_request_id, status_code: extensionRequestSpecialNotes.status_code })
      .from(extensionRequestSpecialNotes),
  ]);

  const waitingCount = rows.filter((r) => r.hr_status_code === "waiting_hr").length;
  const processedCount = rows.filter((r) => r.hr_status_code === "processed").length;
  const specialNotesCountMap = new Map<string, { total: number; open: number }>();
  for (const n of allSpecialNotes) {
    const cur = specialNotesCountMap.get(n.extension_request_id) ?? { total: 0, open: 0 };
    cur.total += 1;
    if (n.status_code !== "resolved") cur.open += 1;
    specialNotesCountMap.set(n.extension_request_id, cur);
  }
  const specialNotesCountByRequest = Array.from(specialNotesCountMap.entries()).map(([requestId, v]) => ({
    requestId,
    total: v.total,
    open: v.open,
  }));

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={ClipboardCheck}
        color="bg-pink-500"
        eyebrow="Human Resources"
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label={t("statTotalApproved")} value={rows.length} color="navy" />
          <StatCard label={t("statWaitingHr")} value={waitingCount} color="amber" />
          <StatCard label={t("statProcessed")} value={processedCount} color="green" />
        </div>

        <ExpandableSection title={t("listTitle", { count: rows.length })}>
          <ExtensionRequestsTable rows={rows} specialNotesCountByRequest={specialNotesCountByRequest} />
        </ExpandableSection>
      </main>
    </div>
  );
}
