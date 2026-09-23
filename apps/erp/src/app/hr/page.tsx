import { db } from "@/db";
import { employees, onboardingRequests, candidates, bpjsRegistrations } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { EmployeesTable } from "./employees-table";
import { ExpandableSection } from "@/components/expandable-section";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { UsersRound } from "lucide-react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function HRPage() {
  const t = await getTranslations("hr.page");
  const data = await db
    .select({
      id: employees.id,
      employee_no: employees.employee_no,
      position_name: employees.position_name,
      job_level_code: employees.job_level_code,
      employee_category_code: employees.employee_category_code,
      company_email: employees.company_email,
      join_date: employees.join_date,
      gender_code: employees.gender_code,
      religion_code: employees.religion_code,
      marital_status_changed_date: employees.marital_status_changed_date,
      ptkp_code: employees.ptkp_code,
      ptkp_effective_year: employees.ptkp_effective_year,
      notes: employees.notes,
      candidate_no: candidates.candidate_no,
      candidate_name: candidates.candidate_name,
      created_at: employees.created_at,
      ktp_file_path: onboardingRequests.ktp_file_path,
      bpjs_kesehatan_file_path: onboardingRequests.bpjs_kesehatan_file_path,
      bpjs_ketenagakerjaan_file_path: onboardingRequests.bpjs_ketenagakerjaan_file_path,
      npwp_file_path: onboardingRequests.npwp_file_path,
      kk_file_path: onboardingRequests.kk_file_path,
      diploma_file_path: onboardingRequests.diploma_file_path,
    })
    .from(employees)
    .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .orderBy(desc(employees.created_at));

  // Semua baris registrasi BPJS -- dipakai buat nandain "Lengkapi Dokumen" di
  // tabel, terpisah dari query utama karena relasinya 1 employee : banyak
  // baris BPJS (per skema kesehatan/ketenagakerjaan).
  const bpjsRows = await db
    .select({ employee_id: bpjsRegistrations.employee_id, status_code: bpjsRegistrations.status_code })
    .from(bpjsRegistrations);
  const incompleteBpjsEmployeeIds = new Set(
    bpjsRows.filter((b) => b.status_code !== "terdaftar").map((b) => b.employee_id)
  );

  const employeesData = data.map((d) => ({
    ...d,
    docsIncomplete:
      !d.ktp_file_path ||
      !d.bpjs_kesehatan_file_path ||
      !d.bpjs_ketenagakerjaan_file_path ||
      !d.npwp_file_path ||
      !d.kk_file_path ||
      !d.diploma_file_path ||
      incompleteBpjsEmployeeIds.has(d.id),
  }));

  const backofficeCount = data.filter((d) => d.employee_category_code === "backoffice").length;
  const talentCount = data.filter((d) => d.employee_category_code === "talent").length;
  const freelanceCount = data.filter((d) => d.employee_category_code === "freelance").length;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={UsersRound}
        color="bg-pink-500"
        eyebrow="Human Resources"
        title={t("title")}
        subtitle={t("subtitle")}
      >
        <Link
          href="/hr/sheet-sync"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("googleSheetSync")}
        </Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t("statTotalEmployee")} value={data.length} color="navy" />
          <StatCard label={t("statBackoffice")} value={backofficeCount} color="blue" />
          <StatCard label={t("statTalent")} value={talentCount} color="green" />
          <StatCard label={t("statFreelance")} value={freelanceCount} color="amber" />
        </div>

        <ExpandableSection title={t("listTitle", { count: data.length })}>
          <EmployeesTable data={employeesData} />
        </ExpandableSection>
      </main>
    </div>
  );
}