import { db } from "@/db";
import { talentAssignments, employees, requisitions, onboardingRequests, candidates, employmentContracts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { decryptPII } from "@/lib/pii-crypto";
import { PageHeader } from "@/components/page-header";
import { Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  pkwt: "PKWT", pkwtt: "PKWTT", probation: "Probation", intern: "Intern",
};

function rp(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  return "Rp " + n.toLocaleString("id-ID");
}

function sumOrNull(values: (number | null | undefined)[]): number | null {
  const present = values.filter((v): v is number => v !== null && v !== undefined);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}

export default async function TalentDatabaseSalaryPage() {
  const t = await getTranslations("tm.databaseSalary");
  const rows = await db
    .select({
      assignment: talentAssignments,
      employee_no: employees.employee_no,
      employee_category_code: employees.employee_category_code,
      job_level_code: employees.job_level_code,
      position_name: employees.position_name,
      company_email: employees.company_email,
      join_date: employees.join_date,
      gender_code: employees.gender_code,
      religion_code: employees.religion_code,
      ptkp_code: employees.ptkp_code,
      ptkp_effective_year: employees.ptkp_effective_year,
      employee_id: employees.id,
      candidate_name: candidates.candidate_name,
      personal_email: onboardingRequests.personal_email,
      nik: onboardingRequests.nik,
      education_level_code: onboardingRequests.education_level_code,
      institution_name: onboardingRequests.institution_name,
      client_name: requisitions.client_name,
      req_position_name: requisitions.position_name,
      level_code: requisitions.level_code,
    })
    .from(talentAssignments)
    .leftJoin(employees, eq(talentAssignments.employee_id, employees.id))
    .leftJoin(requisitions, eq(talentAssignments.requisition_id, requisitions.id))
    .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id));

  const allContracts = await db
    .select()
    .from(employmentContracts)
    .orderBy(desc(employmentContracts.start_date));
  const latestContractByEmployee = new Map<string, (typeof allContracts)[number]>();
  for (const c of allContracts) {
    if (!latestContractByEmployee.has(c.employee_id)) latestContractByEmployee.set(c.employee_id, c);
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Wallet} color="bg-sky-500" eyebrow="Talent Management" title="Talent Database & Salary"
        subtitle={t("subtitle")}
      />

      <main className="px-8 py-8 max-w-6xl mx-auto space-y-3">
        <p className="text-xs text-slate-400">{t("talentCount", { count: rows.length })}</p>

        {rows.map((r) => {
          const a = r.assignment;
          const contract = r.employee_id ? latestContractByEmployee.get(r.employee_id) : undefined;

          const avgOtherComponent = (() => {
            const sum = sumOrNull([
              a.kompensasi_amount, a.thr_allowance_amount, a.annual_bonus_allowance_amount,
              a.annual_medical_reimbursement_amount, a.laptop_ownership_amount, a.training_amount, a.refreshment_amount,
            ]);
            return sum === null ? null : Math.round(sum / 12);
          })();
          const totalBpjsCompany = sumOrNull([
            a.bpjs_kesehatan_company_amount, a.jkk_amount, a.jkm_amount, a.jht_company_amount, a.jkp_amount, a.jp_company_amount,
          ]);
          const totalBpjsEmployee = sumOrNull([a.bpjs_kesehatan_employee_amount, a.jht_employee_amount, a.jp_employee_amount]);
          const totalCogs = sumOrNull([
            a.basic_salary_amount, a.functional_allowance_amount, a.transport_allowance_amount,
            a.project_allowance_amount, a.accommodation_allowance_amount, a.field_allowance_amount,
            a.overtime_allowance_amount, avgOtherComponent, totalBpjsCompany,
          ]);
          const marginAmount = totalCogs !== null && a.price_amount !== null ? a.price_amount - totalCogs : null;
          const marginPercent = marginAmount !== null && a.price_amount ? (marginAmount / a.price_amount) * 100 : null;

          const isCurrent = a.status_code === "on_project";
          return (
            <details key={a.id} className={`group rounded-xl border shadow-sm open:shadow-md ${isCurrent ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"}`}>
              <summary className="flex cursor-pointer items-center gap-3 px-5 py-4 list-none">
                <span className="text-slate-400 transition-transform group-open:rotate-90">&#9656;</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isCurrent && (
                      <span className="inline-flex items-center rounded-full whitespace-nowrap bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white shrink-0">{t("current")}</span>
                    )}
                    <p className="text-sm font-semibold text-slate-900 truncate">{r.candidate_name ?? "-"}</p>
                  </div>
                  <p className="text-xs text-slate-400">
                    {r.employee_no ?? "-"} &middot; {r.position_name ?? r.req_position_name ?? "-"} &middot; {r.client_name ?? "-"}
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-6 text-right shrink-0">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Price</p>
                    <p className="text-sm font-medium text-slate-800">{rp(a.price_amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Status</p>
                    <p className={`text-sm font-medium ${isCurrent ? "text-emerald-700" : "text-slate-800"}`}>{a.status_code ?? "-"}</p>
                  </div>
                </div>
              </summary>

              <div className="border-t border-slate-100 px-5 py-5 space-y-5">
                <Section title="A. Information">
                  <Item label="Employee No" value={r.employee_no} />
                  <Item label={t("name")} value={r.candidate_name} />
                  <Item label="Position" value={r.position_name ?? r.req_position_name} />
                  <Item label="Level" value={r.level_code} />
                  <Item label="Client" value={r.client_name} />
                  <Item label="Company Email" value={r.company_email} />
                  <Item label="Personal Email" value={r.personal_email} />
                  <Item label="NIK" value={decryptPII(r.nik)} />
                  <Item label="Gender" value={r.gender_code} />
                  <Item label="Religion" value={r.religion_code} />
                  <Item label="Education" value={r.education_level_code} />
                  <Item label="Institution" value={r.institution_name} />
                  <Item label="Join Date" value={r.join_date} />
                  <Item label="Contract Status" value={contract ? EMPLOYMENT_TYPE_LABELS[contract.employment_type_code] ?? contract.employment_type_code : null} />
                  <Item label="Contract No" value={contract?.contract_no} />
                  <Item label="PTKP" value={r.ptkp_code ? `${r.ptkp_code} (${r.ptkp_effective_year ?? "-"})` : null} />
                  <Item label="Employee Category" value={r.employee_category_code} />
                  <Item label="Job Level" value={r.job_level_code} />
                </Section>

                <Section title="Project / Assignment">
                  <Item label="Start Date" value={a.start_date} />
                  <Item label="End Date" value={a.end_date} />
                  <Item label="Status" value={a.status_code} />
                  <Item label="Talent Track" value={a.talent_track_code} />
                  <Item label="Increment Date" value={a.increment_date} />
                  <Item label="Current Grading" value={a.current_grading} />
                  <Item label="Current Salary Grade" value={a.current_salary_grade_code} />
                  <Item label="Increment Amount Deal" value={a.increment_amount_deal !== null ? rp(a.increment_amount_deal) : null} />
                  <Item label="Increment % Deal" value={a.increment_percent_deal !== null ? `${a.increment_percent_deal}%` : null} />
                  <Item label="Current Skill" value={a.current_skill} />
                  <Item label="Current Certification" value={a.current_certification} />
                  <Item label="Performance Appraisal" value={a.performance_appraisal_result} />
                  <Item label="Performance Review" value={a.performance_review_result} />
                  <Item label="People Summarize" value={a.people_summarize} />
                  <Item label="Status All Data" value={a.status_all_data_code} />
                  <Item label="Notes" value={a.notes} />
                </Section>

                <Section title="B. Tax">
                  <Item label="Tax Bruto" value={rp(a.tax_bruto_amount)} />
                </Section>

                <Section title="C. Salary">
                  <Item label="Take Home Pay" value={rp(a.take_home_pay_amount)} />
                  <Item label="Gross Salary" value={rp(a.gross_salary_amount)} />
                </Section>

                <Section title="D. Fix Salary">
                  <Item label="Basic Salary" value={rp(a.basic_salary_amount)} />
                </Section>

                <Section title="E. Unfix Salary">
                  <Item label="Functional Allowance" value={rp(a.functional_allowance_amount)} />
                  <Item label="Transport Allowance" value={rp(a.transport_allowance_amount)} />
                  <Item label="Project Allowance" value={rp(a.project_allowance_amount)} />
                  <Item label="Accommodation Allowance" value={rp(a.accommodation_allowance_amount)} />
                  <Item label={t("fieldAllowance")} value={rp(a.field_allowance_amount)} />
                  <Item label="Overtime" value={rp(a.overtime_allowance_amount)} />
                </Section>

                <Section title="F. Other Component (setahun)">
                  <Item label={t("compensation")} value={rp(a.kompensasi_amount)} />
                  <Item label="THR Allowance" value={rp(a.thr_allowance_amount)} />
                  <Item label="Annual Bonus Allowance" value={rp(a.annual_bonus_allowance_amount)} />
                  <Item label="Annual Medical Reimbursement" value={rp(a.annual_medical_reimbursement_amount)} />
                  <Item label="Laptop Ownership Program" value={rp(a.laptop_ownership_amount)} />
                  <Item label="Training" value={rp(a.training_amount)} />
                  <Item label="Refreshment" value={rp(a.refreshment_amount)} />
                  <Item label="Average Other Component / bulan" value={rp(avgOtherComponent)} strong />
                </Section>

                <Section title="G. BPJS Company Portion (per bulan)">
                  <Item label={t("bpjsHealthPremium")} value={rp(a.bpjs_kesehatan_company_amount)} />
                  <Item label={t("jkkLabel")} value={rp(a.jkk_amount)} />
                  <Item label={t("jkmLabel")} value={rp(a.jkm_amount)} />
                  <Item label={t("jhtLabel")} value={rp(a.jht_company_amount)} />
                  <Item label={t("jkpLabel")} value={rp(a.jkp_amount)} />
                  <Item label={t("jpLabel")} value={rp(a.jp_company_amount)} />
                  <Item label="Average Other Monthly Cost" value={rp(totalBpjsCompany)} strong />
                </Section>

                <Section title="H. BPJS Deduction - Employee Portion (per bulan)">
                  <Item label={t("bpjsHealthPremium")} value={rp(a.bpjs_kesehatan_employee_amount)} />
                  <Item label={t("jhtLabel")} value={rp(a.jht_employee_amount)} />
                  <Item label={t("jpLabel")} value={rp(a.jp_employee_amount)} />
                  <Item label="Total Monthly BPJS Employee Deduction" value={rp(totalBpjsEmployee)} strong />
                </Section>

                <Section title="I. Total">
                  <Item label="Total COGS (Cost)" value={rp(totalCogs)} strong />
                  <Item label="Management Fee" value={rp(a.management_fee_amount)} />
                  <Item label="Price" value={rp(a.price_amount)} strong />
                  <Item label="Margin Amount" value={rp(marginAmount)} strong />
                  <Item label="Margin (%)" value={marginPercent !== null ? `${marginPercent.toFixed(2)}%` : "-"} strong />
                </Section>
              </div>
            </details>
          );
        })}

        {rows.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center text-slate-400">
            {t("noData")}
          </div>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-500">{title}</h3>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3 rounded-lg bg-slate-50 p-4">
        {children}
      </div>
    </section>
  );
}

function Item({ label, value, strong }: { label: string; value: string | number | null | undefined; strong?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`text-sm ${strong ? "font-semibold text-slate-900" : "text-slate-700"}`}>{value ?? "-"}</p>
    </div>
  );
}
