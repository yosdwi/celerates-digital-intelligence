import { db } from "@/db";
import { candidates, applications, requisitions, onboardingRequests, employees, talentAssignments } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { HiringStatusBadge } from "../../pipeline/hiring-status-badge";
import { Timeline, TimelineEvent } from "@/components/timeline";
import { prettify } from "@/components/dashboard-charts";
import { SalaryHistory } from "@/components/salary-history";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { User } from "lucide-react";

export default async function CandidateProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("ta.candidates.detailPage");
  const { id } = await params;
  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id));
  if (!candidate) notFound();

  const [applicationRows, onboardingRows] = await Promise.all([
    db
      .select({
        id: applications.id,
        application_date: applications.application_date,
        client_name: requisitions.client_name,
        position_name: requisitions.position_name,
        ta_pic_name: applications.ta_pic_name,
        price_amount: applications.price_amount,
        hiring_status_code: applications.hiring_status_code,
      })
      .from(applications)
      .leftJoin(requisitions, eq(applications.requisition_id, requisitions.id))
      .where(eq(applications.candidate_id, id)),
    db
      .select({
        id: onboardingRequests.id,
        created_at: onboardingRequests.created_at,
        start_date: onboardingRequests.start_date,
        employee_status_code: onboardingRequests.employee_status_code,
        client_name: requisitions.client_name,
        position_name: requisitions.position_name,
      })
      .from(onboardingRequests)
      .leftJoin(requisitions, eq(onboardingRequests.requisition_id, requisitions.id))
      .where(eq(onboardingRequests.candidate_id, id)),
  ]);

  const onboardingIds = onboardingRows.map((o) => o.id);
  const employeeRows = onboardingIds.length > 0
    ? await db.select().from(employees).where(inArray(employees.onboarding_request_id, onboardingIds))
    : [];

  const employeeIds = employeeRows.map((e) => e.id);
  const salaryRows = employeeIds.length > 0
    ? await db
        .select({
          id: talentAssignments.id,
          clientName: requisitions.client_name,
          positionName: requisitions.position_name,
          startDate: talentAssignments.start_date,
          endDate: talentAssignments.end_date,
          statusCode: talentAssignments.status_code,
          basicSalary: talentAssignments.basic_salary_amount,
          functionalAllowance: talentAssignments.functional_allowance_amount,
          transportAllowance: talentAssignments.transport_allowance_amount,
          projectAllowance: talentAssignments.project_allowance_amount,
          accommodationAllowance: talentAssignments.accommodation_allowance_amount,
          fieldAllowance: talentAssignments.field_allowance_amount,
          overtimeAllowance: talentAssignments.overtime_allowance_amount,
          priceAmount: talentAssignments.price_amount,
        })
        .from(talentAssignments)
        .leftJoin(requisitions, eq(talentAssignments.requisition_id, requisitions.id))
        .where(inArray(talentAssignments.employee_id, employeeIds))
    : [];

  // Rekap dihitung dari prefix kode hiring_status_code yang sekarang
  // (reject_/failed_ = ditolak, withdraw_ = withdraw, sisanya = masih berjalan).
  const rejectedCount = applicationRows.filter((h) => h.hiring_status_code.startsWith("reject_") || h.hiring_status_code.startsWith("failed_")).length;
  const withdrawnCount = applicationRows.filter((h) => h.hiring_status_code.startsWith("withdraw_")).length;
  const activeCount = applicationRows.length - rejectedCount - withdrawnCount;

  const events: TimelineEvent[] = [
    {
      id: `candidate-${candidate.id}`,
      date: candidate.candidate_date,
      title: t("timeline.registeredAsCandidate"),
      subtitle: candidate.candidate_source_code ? t("timeline.source", { source: prettify(candidate.candidate_source_code) }) : undefined,
      colorClass: "bg-slate-400",
    },
    ...applicationRows.map((a): TimelineEvent => ({
      id: `application-${a.id}`,
      date: a.application_date,
      title: t("timeline.appliedTo", { client: a.client_name ?? "-", position: a.position_name ?? "-" }),
      subtitle: `TA PIC: ${a.ta_pic_name}${a.price_amount ? ` · Rp ${a.price_amount.toLocaleString("id-ID")}` : ""}`,
      badge: <HiringStatusBadge hiringStatusCode={a.hiring_status_code} />,
      colorClass: "bg-blue-500",
    })),
    ...onboardingRows.map((o): TimelineEvent => ({
      id: `onboarding-${o.id}`,
      date: o.start_date ?? o.created_at?.toISOString().slice(0, 10) ?? null,
      title: `Onboarding — ${o.client_name ?? "-"} — ${o.position_name ?? "-"}`,
      subtitle: o.employee_status_code ? t("timeline.status", { status: prettify(o.employee_status_code) }) : undefined,
      colorClass: "bg-purple-500",
    })),
    ...employeeRows.map((e): TimelineEvent => ({
      id: `employee-${e.id}`,
      date: e.join_date ?? e.created_at.toISOString().slice(0, 10),
      title: t("timeline.becameEmployee", { employeeNo: e.employee_no }),
      subtitle: e.position_name ?? undefined,
      colorClass: "bg-green-500",
    })),
  ];

  return (
    <div className="min-h-screen">
      <PageHeader icon={User} color="bg-amber-500" eyebrow="Talent Acquisition" title={candidate.candidate_name} subtitle={candidate.candidate_no}>
        <Link href="/ta/candidates" className="text-sm font-medium text-amber-700 hover:underline">&larr; {t("backToCandidateList")}</Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-6 max-w-4xl mx-auto">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label={t("stats.totalApplied")} value={applicationRows.length} />
          <Stat label={t("stats.stillOngoing")} value={activeCount} valueClassName="text-blue-600" />
          <Stat label={t("stats.rejected")} value={rejectedCount} valueClassName="text-red-600" />
          <Stat label={t("stats.withdrawn")} value={withdrawnCount} valueClassName="text-orange-600" />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-700">{t("journeyTitle")}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{t("journeySubtitle", { name: candidate.candidate_name })}</p>
          </div>
          <div className="px-6 py-6">
            <Timeline events={events} />
          </div>
        </section>

        <SalaryHistory periods={salaryRows} title={t("salaryHistoryTitle")} />
      </main>
    </div>
  );
}

function Stat({ label, value, valueClassName = "text-slate-900" }: { label: string; value: number; valueClassName?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-0.5 ${valueClassName}`}>{value}</p>
    </div>
  );
}
