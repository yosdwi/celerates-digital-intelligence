import { db } from "@/db";
import { talentAssignments, employees, candidates, onboardingRequests, requisitions, employmentContracts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Calculator } from "lucide-react";
import { CogsCalculatorForm } from "./calculator-form";
import { getTranslations } from "next-intl/server";

export default async function CogsCalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ talent_assignment_id?: string }>;
}) {
  const t = await getTranslations("tm.cogsCalculator");
  const { talent_assignment_id } = await searchParams;
  const rows = await db
    .select({
      id: talentAssignments.id,
      employee_no: employees.employee_no,
      candidate_no: candidates.candidate_no,
      candidate_name: candidates.candidate_name,
      client_name: requisitions.client_name,
      ptkp_code: employees.ptkp_code,
      price_amount: talentAssignments.price_amount,
      basic_salary_amount: talentAssignments.basic_salary_amount,
      functional_allowance_amount: talentAssignments.functional_allowance_amount,
      transport_allowance_amount: talentAssignments.transport_allowance_amount,
      project_allowance_amount: talentAssignments.project_allowance_amount,
      accommodation_allowance_amount: talentAssignments.accommodation_allowance_amount,
      field_allowance_amount: talentAssignments.field_allowance_amount,
      overtime_allowance_amount: talentAssignments.overtime_allowance_amount,
      employee_id: employees.id,
    })
    .from(talentAssignments)
    .leftJoin(employees, eq(talentAssignments.employee_id, employees.id))
    .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .leftJoin(requisitions, eq(talentAssignments.requisition_id, requisitions.id));

  // Kontrak terakhir per employee -- dipakai buat nebak default Annual Medical
  // Reimbursement (cuma jalan kalau status karyawan PKWTT, sesuai rumus Excel).
  const allContracts = await db
    .select({ employee_id: employmentContracts.employee_id, employment_type_code: employmentContracts.employment_type_code })
    .from(employmentContracts)
    .orderBy(desc(employmentContracts.start_date));
  const employmentTypeByEmployee = new Map<string, string>();
  for (const c of allContracts) {
    if (!employmentTypeByEmployee.has(c.employee_id)) employmentTypeByEmployee.set(c.employee_id, c.employment_type_code);
  }

  const talentOptions = rows.map((r) => ({
    ...r,
    employment_type_code: r.employee_id ? employmentTypeByEmployee.get(r.employee_id) ?? null : null,
  }));

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Calculator}
        color="bg-sky-600"
        eyebrow="Talent Management"
        title="COGS Calculator"
        subtitle={t("subtitle")}
      />

      <main className="px-8 py-8 max-w-6xl mx-auto">
        <CogsCalculatorForm talentOptions={talentOptions} initialSelectedId={talent_assignment_id} />
      </main>
    </div>
  );
}
