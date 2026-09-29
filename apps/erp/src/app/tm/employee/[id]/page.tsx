import { db } from "@/db";
import {
  employees, onboardingRequests, candidates, talentAssignments, requisitions,
  extensionIncrementRequests, employmentContracts,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Timeline, TimelineEvent } from "@/components/timeline";
import { prettify } from "@/components/dashboard-charts";
import { SmartFileLink } from "@/components/smart-file-link";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { User } from "lucide-react";
import { getTranslations } from "next-intl/server";

function gross(a: { basic_salary_amount: number | null; functional_allowance_amount: number | null; transport_allowance_amount: number | null; project_allowance_amount: number | null; accommodation_allowance_amount: number | null; field_allowance_amount: number | null; overtime_allowance_amount: number | null }) {
  return (a.basic_salary_amount ?? 0) + (a.functional_allowance_amount ?? 0) + (a.transport_allowance_amount ?? 0)
    + (a.project_allowance_amount ?? 0) + (a.accommodation_allowance_amount ?? 0) + (a.field_allowance_amount ?? 0) + (a.overtime_allowance_amount ?? 0);
}
function rp(n: number | null | undefined) {
  return n ? `Rp ${n.toLocaleString("id-ID")}` : "-";
}
function formatDdMmYyyy(dateStr: string | null): string {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}-${m}-${y}`;
}
function isLink(value: string): boolean {
  return value.startsWith("http");
}

export default async function TalentJourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("tm.employee");
  const { id } = await params;

  const [employee] = await db.select().from(employees).where(eq(employees.id, id));
  if (!employee) notFound();

  const [onboarding] = employee.onboarding_request_id
    ? await db.select().from(onboardingRequests).where(eq(onboardingRequests.id, employee.onboarding_request_id))
    : [undefined];
  const [candidate] = onboarding?.candidate_id
    ? await db.select().from(candidates).where(eq(candidates.id, onboarding.candidate_id))
    : [undefined];

  const assignmentRows = await db
    .select({
      id: talentAssignments.id,
      client_name: requisitions.client_name,
      position_name: requisitions.position_name,
      start_date: talentAssignments.start_date,
      end_date: talentAssignments.end_date,
      status_code: talentAssignments.status_code,
      talent_track_code: talentAssignments.talent_track_code,
      current_grading: talentAssignments.current_grading,
      current_salary_grade_code: talentAssignments.current_salary_grade_code,
      price_amount: talentAssignments.price_amount,
      basic_salary_amount: talentAssignments.basic_salary_amount,
      functional_allowance_amount: talentAssignments.functional_allowance_amount,
      transport_allowance_amount: talentAssignments.transport_allowance_amount,
      project_allowance_amount: talentAssignments.project_allowance_amount,
      accommodation_allowance_amount: talentAssignments.accommodation_allowance_amount,
      field_allowance_amount: talentAssignments.field_allowance_amount,
      overtime_allowance_amount: talentAssignments.overtime_allowance_amount,
      performance_appraisal_result: talentAssignments.performance_appraisal_result,
      performance_review_result: talentAssignments.performance_review_result,
      notes: talentAssignments.notes,
      created_at: talentAssignments.created_at,
    })
    .from(talentAssignments)
    .leftJoin(requisitions, eq(talentAssignments.requisition_id, requisitions.id))
    .where(eq(talentAssignments.employee_id, id))
    .orderBy(desc(talentAssignments.start_date));

  const extensionRows = await db
    .select()
    .from(extensionIncrementRequests)
    .where(eq(extensionIncrementRequests.employee_id, id))
    .orderBy(desc(extensionIncrementRequests.created_at));

  const contractRows = await db
    .select()
    .from(employmentContracts)
    .where(eq(employmentContracts.employee_id, id))
    .orderBy(desc(employmentContracts.start_date));

  const currentAssignment = assignmentRows.find((a) => a.status_code === "on_project") ?? assignmentRows[0];
  const currentGross = currentAssignment ? gross(currentAssignment) : 0;

  const events: TimelineEvent[] = [
    ...assignmentRows.map((a): TimelineEvent => ({
      id: `assignment-${a.id}`,
      date: a.start_date ?? a.created_at.toISOString().slice(0, 10),
      title: `Assignment — ${a.client_name ?? "-"} — ${a.position_name ?? "-"}`,
      subtitle: t("assignmentSubtitle", { end: a.end_date ?? t("now"), status: prettify(a.status_code) ?? "-", price: rp(a.price_amount), gross: rp(gross(a)) }),
      colorClass: a.status_code === "on_project" ? "bg-green-500" : "bg-blue-500",
    })),
    ...extensionRows.map((e): TimelineEvent => ({
      id: `extension-${e.id}`,
      date: e.created_at.toISOString().slice(0, 10),
      title: `${t("extensionIncrementSubmission")}${e.proposed_position_name ? ` — ${e.proposed_position_name}` : ""}`,
      subtitle: t("extensionSubtitle", { start: e.propose_start_date ?? "-", end: e.propose_end_date ?? "-", statusTm: prettify(e.status_code) ?? "-", statusHr: prettify(e.hr_status_code) ?? "-" }),
      colorClass: e.status_code === "approved" ? "bg-purple-500" : "bg-amber-400",
    })),
    ...contractRows.map((c): TimelineEvent => ({
      id: `contract-${c.id}`,
      date: c.start_date,
      title: c.addendum_seq ? t("contractAddendum", { seq: c.addendum_seq, contractNo: c.contract_no }) : t("contractMain", { contractNo: c.contract_no }),
      subtitle: `${t("until")} ${c.end_date ?? t("noEndDate")} · ${prettify(c.employment_type_code)}`,
      colorClass: "bg-slate-500",
    })),
  ];

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={User} color="bg-sky-500" eyebrow="Talent Management" title={candidate?.candidate_name ?? "-"}
        subtitle={`${employee.employee_no} · ${employee.position_name ?? "-"}`}
      >
        <Link href="/tm" className="text-sm font-medium text-sky-700 hover:underline">&larr; {t("backToTalentsBook")}</Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-6 max-w-5xl mx-auto">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label={t("totalProject")} value={assignmentRows.length} />
          <Stat label={t("currentProject")} value={currentAssignment ? `${currentAssignment.client_name ?? "-"}` : "-"} isText />
          <Stat label={t("totalExtensionSubmissions")} value={extensionRows.length} />
          <Stat label={t("currentGrossSalary")} value={rp(currentGross)} isText />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-700">{t("journeyTitle")}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{t("journeyDescription")}</p>
          </div>
          <div className="px-6 py-6">
            <Timeline events={events} />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-700">{t("assignmentHistory", { count: assignmentRows.length })}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-200 bg-brand-50 text-left text-xs font-semibold uppercase tracking-wide text-brand-700">
                  <th className="px-4 py-3 min-w-[130px]">Client</th>
                  <th className="px-4 py-3 min-w-[130px]">Positions</th>
                  <th className="px-4 py-3 min-w-[110px]">Start</th>
                  <th className="px-4 py-3 min-w-[110px]">End</th>
                  <th className="px-4 py-3 min-w-[110px]">Status</th>
                  <th className="px-4 py-3 min-w-[90px]">Track</th>
                  <th className="px-4 py-3 min-w-[90px]">Grading</th>
                  <th className="px-4 py-3 min-w-[130px]">Price</th>
                  <th className="px-4 py-3 min-w-[130px]">Basic Salary</th>
                  <th className="px-4 py-3 min-w-[130px]">Total Allowance</th>
                  <th className="px-4 py-3 min-w-[140px]">Gross Salary</th>
                  <th className="px-4 py-3 min-w-[140px]">Performance</th>
                </tr>
              </thead>
              <tbody>
                {assignmentRows.map((a) => {
                  const allowance = gross(a) - (a.basic_salary_amount ?? 0);
                  return (
                    <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{a.client_name ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{a.position_name ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDdMmYyyy(a.start_date)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDdMmYyyy(a.end_date)}</td>
                      <td className="px-4 py-3 text-slate-600">{prettify(a.status_code)}</td>
                      <td className="px-4 py-3 text-slate-600 uppercase">{a.talent_track_code ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600 uppercase">{a.current_grading ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{rp(a.price_amount)}</td>
                      <td className="px-4 py-3 text-slate-600">{rp(a.basic_salary_amount)}</td>
                      <td className="px-4 py-3 text-slate-600">{rp(allowance)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{rp(gross(a))}</td>
                      <td className="px-4 py-3 text-slate-600 space-y-1">
                        {a.performance_appraisal_result && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] uppercase text-slate-400">Appraisal:</span>
                            {isLink(a.performance_appraisal_result) ? <SmartFileLink value={a.performance_appraisal_result} /> : <span>{a.performance_appraisal_result}</span>}
                          </div>
                        )}
                        {a.performance_review_result && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] uppercase text-slate-400">Review:</span>
                            {isLink(a.performance_review_result) ? <SmartFileLink value={a.performance_review_result} /> : <span>{a.performance_review_result}</span>}
                          </div>
                        )}
                        {!a.performance_appraisal_result && !a.performance_review_result && "-"}
                      </td>
                    </tr>
                  );
                })}
                {assignmentRows.length === 0 && (
                  <tr><td colSpan={12} className="px-6 py-10 text-center text-slate-400">{t("noAssignmentHistory")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-700">{t("extensionHistory", { count: extensionRows.length })}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-200 bg-brand-50 text-left text-xs font-semibold uppercase tracking-wide text-brand-700">
                  <th className="px-4 py-3 min-w-[110px]">Diajukan</th>
                  <th className="px-4 py-3 min-w-[110px]">Propose Start</th>
                  <th className="px-4 py-3 min-w-[110px]">Propose End</th>
                  <th className="px-4 py-3 min-w-[130px]">Proposed Positions</th>
                  <th className="px-4 py-3 min-w-[110px]">Proposed Grade</th>
                  <th className="px-4 py-3 min-w-[130px]">Proposed Basic Salary</th>
                  <th className="px-4 py-3 min-w-[130px]">Requester</th>
                  <th className="px-4 py-3 min-w-[110px]">Status TM</th>
                  <th className="px-4 py-3 min-w-[110px]">Status HR</th>
                </tr>
              </thead>
              <tbody>
                {extensionRows.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">{e.created_at.toISOString().slice(0, 10)}</td>
                    <td className="px-4 py-3 text-slate-600">{e.propose_start_date ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{e.propose_end_date ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{e.proposed_position_name ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{prettify(e.proposed_grade_level_code)}</td>
                    <td className="px-4 py-3 text-slate-600">{rp(e.proposed_basic_salary_amount)}</td>
                    <td className="px-4 py-3 text-slate-600">{e.requester_name}</td>
                    <td className="px-4 py-3 text-slate-600">{prettify(e.status_code)}</td>
                    <td className="px-4 py-3 text-slate-600">{prettify(e.hr_status_code)}</td>
                  </tr>
                ))}
                {extensionRows.length === 0 && (
                  <tr><td colSpan={9} className="px-6 py-10 text-center text-slate-400">{t("noExtensionHistory")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-700">{t("contractHistory", { count: contractRows.length })}</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {contractRows.map((c) => (
              <div key={c.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-900">
                    {c.contract_no} {c.addendum_seq ? <span className="text-xs text-slate-500">({t("addendumNo", { seq: c.addendum_seq })})</span> : <span className="text-xs text-slate-500">({t("mainContract")})</span>}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {prettify(c.employment_type_code)} &middot; {c.start_date} {t("until")} {c.end_date ?? t("noEndDate")}
                    {c.sk_no && ` · SK: ${c.sk_no}`}
                  </p>
                </div>
              </div>
            ))}
            {contractRows.length === 0 && (
              <p className="px-6 py-10 text-center text-slate-400 text-sm">{t("noContractHistory")}</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, isText }: { label: string; value: number | string; isText?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`${isText ? "text-base" : "text-2xl"} font-semibold mt-0.5 text-slate-900 truncate`}>{value}</p>
    </div>
  );
}
