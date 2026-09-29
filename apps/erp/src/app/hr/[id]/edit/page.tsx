import { db } from "@/db";
import { employees } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { updateEmployee } from "../../actions";
import Link from "next/link";
import { Field, SelectField } from "@/components/form-fields";
import { PageHeader } from "@/components/page-header";
import { Pencil } from "lucide-react";
import { getTranslations } from "next-intl/server";

const CATEGORIES = [["backoffice", "Backoffice"], ["talent", "Talent"], ["freelance", "Freelance"]] as const;
const JOB_LEVELS = [["internship", "Internship"], ["staff", "Staff"], ["manager", "Manager"], ["head", "Head"], ["chief", "Chief"]] as const;

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("hr.edit");
  const GENDERS = [["male", t("genderMale")], ["female", t("genderFemale")]] as const;
  const RELIGIONS = [["islam", "Islam"], ["kristen", "Kristen"], ["katolik", "Katolik"], ["hindu", "Hindu"], ["buddha", "Buddha"], ["konghucu", "Konghucu"]] as const;
  const { id } = await params;
  const [employee] = await db.select().from(employees).where(eq(employees.id, id));
  if (!employee) notFound();

  const updateWithId = updateEmployee.bind(null, id);

  return (
    <div className="min-h-screen">
      <PageHeader icon={Pencil} color="bg-rose-500" eyebrow="Human Resources" title={t("pageTitle", { employeeNo: employee.employee_no })}>
        <Link href="/hr" className="text-sm font-medium text-rose-700 hover:underline">&larr; {t("backToEmployeeList")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-3xl mx-auto">
        <form action={updateWithId} className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <SelectField label={t("type")} name="employee_category_code" defaultValue={employee.employee_category_code ?? ""} options={CATEGORIES} required />
          <SelectField label={t("jobLevel")} name="job_level_code" defaultValue={employee.job_level_code ?? ""} options={JOB_LEVELS} required />
          <Field label={t("positions")} name="position_name" defaultValue={employee.position_name ?? ""} />

          <Field label={t("companyEmail")} name="company_email" type="email" defaultValue={employee.company_email ?? ""} />
          <Field label={t("joinDate")} name="join_date" type="date" defaultValue={employee.join_date ?? ""} />
          <SelectField label={t("gender")} name="gender_code" defaultValue={employee.gender_code ?? ""} options={GENDERS} />

          <SelectField label={t("religion")} name="religion_code" defaultValue={employee.religion_code ?? ""} options={RELIGIONS} />
          <Field label={t("maritalStatusChangedDate")} name="marital_status_changed_date" type="date" defaultValue={employee.marital_status_changed_date ?? ""} />
          <SelectField
              label={t("ptkp")} name="ptkp_code" defaultValue={employee.ptkp_code ?? ""}
              options={[["tk0","TK/0"],["tk1","TK/1"],["tk2","TK/2"],["tk3","TK/3"],["k0","K/0"],["k1","K/1"],["k2","K/2"],["k3","K/3"],["ki0","K/I/0"],["ki1","K/I/1"],["ki2","K/I/2"],["ki3","K/I/3"]]}
            />
            <Field label={t("ptkpEffectiveYear")} name="ptkp_effective_year" type="number" defaultValue={employee.ptkp_effective_year?.toString() ?? ""} />

          <div className="sm:col-span-3">
            <Field label={t("notes")} name="notes" defaultValue={employee.notes ?? ""} textarea />
          </div>

          <div className="sm:col-span-3 flex gap-3 pt-2">
            <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
              {t("saveChanges")}
            </button>
            <Link href="/hr" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {t("cancel")}
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
