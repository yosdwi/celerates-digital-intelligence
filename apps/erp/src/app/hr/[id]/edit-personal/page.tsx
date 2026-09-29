import { db } from "@/db";
import { employees, onboardingRequests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { decryptPII } from "@/lib/pii-crypto";
import { updateEmployeePersonalData } from "../../actions";
import Link from "next/link";
import { Field as FieldBase, SelectField } from "@/components/form-fields";
import { PageHeader } from "@/components/page-header";
import { Pencil } from "lucide-react";
import { getTranslations } from "next-intl/server";

function Field(props: React.ComponentProps<typeof FieldBase>) {
  return <FieldBase rows={2} {...props} />;
}

const EDUCATION_LEVELS = [
  ["s3", "S3"], ["s2", "S2"], ["s1", "S1"], ["d4", "D4"], ["d3", "D3"], ["sma_smk", "SMA/SMK"],
] as const;
const EMPLOYEE_STATUS = [
  ["new_hire", "New Hire"], ["replacement", "Replacement"], ["internal", "Internal"],
  ["freelance", "Freelance"], ["bootcamp", "Bootcamp"],
] as const;

export default async function EditEmployeePersonalDataPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("hr.editPersonal");
  const MARITAL_STATUS = [["belum_kawin", t("maritalStatusSingle")], ["kawin", t("maritalStatusMarried")]] as const;
  const BLOOD_TYPES = [
    ["a_plus", "A+"], ["a_minus", "A-"], ["b_plus", "B+"], ["b_minus", "B-"],
    ["ab_plus", "AB+"], ["ab_minus", "AB-"], ["o_plus", "O+"], ["o_minus", "O-"], ["belum_periksa", t("bloodTypeNotChecked")],
  ] as const;
  const { id } = await params;
  const [employee] = await db.select().from(employees).where(eq(employees.id, id));
  if (!employee) notFound();

  const [record] = employee.onboarding_request_id
    ? await db.select().from(onboardingRequests).where(eq(onboardingRequests.id, employee.onboarding_request_id))
    : [undefined];
  if (!record) notFound();

  const updateWithId = updateEmployeePersonalData.bind(null, id);

  return (
    <div className="min-h-screen">
      <PageHeader icon={Pencil} color="bg-rose-500" eyebrow="Human Resources" title={t("pageTitle", { employeeNo: employee.employee_no })}>
        <Link href={`/hr/${id}`} className="text-sm font-medium text-rose-700 hover:underline">&larr; {t("backToProfile")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-5xl mx-auto space-y-8">
        <form action={updateWithId} className="space-y-8">
          <FormSection title={t("personalDataSection")}>
            <Field label={t("nik")} name="nik" defaultValue={decryptPII(record.nik) ?? ""} />
            <Field label={t("birthPlace")} name="birth_place" defaultValue={record.birth_place ?? ""} />
            <Field label={t("birthDate")} name="birth_date" type="date" defaultValue={record.birth_date ?? ""} />
            <Field label={t("availableStartDate")} name="available_start_date" type="date" defaultValue={record.available_start_date ?? ""} />
            <Field label={t("idCardAddress")} name="id_card_address" defaultValue={record.id_card_address ?? ""} textarea />
            <Field label={t("currentAddress")} name="current_address" defaultValue={record.current_address ?? ""} textarea />
            <SelectField label={t("lastEducation")} name="education_level_code" defaultValue={record.education_level_code ?? ""} options={EDUCATION_LEVELS} />
            <Field label={t("institutionName")} name="institution_name" defaultValue={record.institution_name ?? ""} />
            <Field label={t("major")} name="major" defaultValue={record.major ?? ""} />
            <Field label={t("gpa")} name="gpa" defaultValue={record.gpa ?? ""} />
            <Field label={t("personalEmail")} name="personal_email" type="email" defaultValue={record.personal_email ?? ""} />
            <Field label={t("personalPhone")} name="personal_phone" defaultValue={record.personal_phone ?? ""} />
            <Field label={t("npwp")} name="npwp" defaultValue={decryptPII(record.npwp) ?? ""} />
            <Field label={t("familyCardNo")} name="family_card_no" defaultValue={decryptPII(record.family_card_no) ?? ""} />
            <SelectField label={t("currentMaritalStatus")} name="marital_status_code" defaultValue={record.marital_status_code ?? ""} options={MARITAL_STATUS} />
            <SelectField
              label={t("dependentCount")} name="dependent_count"
              defaultValue={record.dependent_count?.toString() ?? ""}
              options={[["0","0"],["1","1"],["2","2"],["3","3"],["4","4"],["5","5"],["6","6"],["7","7"],["8","8"],["9","9"],["10","10"],["other","Other"]]}
            />
            <Field label={t("bankAccountNo")} name="bank_account_no" defaultValue={decryptPII(record.bank_account_no) ?? ""} />
            <Field label={t("bankName")} name="bank_name" defaultValue={record.bank_name ?? ""} />
            <Field label={t("bankAccountHolderName")} name="bank_account_holder_name" defaultValue={record.bank_account_holder_name ?? ""} />
            <Field label={t("bankBranchName")} name="bank_branch_name" defaultValue={record.bank_branch_name ?? ""} />
            <Field label={t("bpjsKesehatanPersonalNo")} name="bpjs_kesehatan_personal_no" defaultValue={record.bpjs_kesehatan_personal_no ?? ""} />
            <CheckboxField label={t("willingTransferBpjsKesehatan")} name="bpjs_kesehatan_willing_transfer" defaultChecked={record.bpjs_kesehatan_willing_transfer ?? false} />
            <Field label={t("bpjsKetenagakerjaanPersonalNo")} name="bpjs_ketenagakerjaan_personal_no" defaultValue={record.bpjs_ketenagakerjaan_personal_no ?? ""} />
            <Field label={t("emergencyContactName")} name="emergency_contact_name" defaultValue={record.emergency_contact_name ?? ""} />
            <Field label={t("emergencyContactRelationship")} name="emergency_contact_relationship" defaultValue={record.emergency_contact_relationship ?? ""} />
            <Field label={t("emergencyContactPhone")} name="emergency_contact_phone" defaultValue={record.emergency_contact_phone ?? ""} />
            <Field label={t("motherMaidenName")} name="mother_maiden_name" defaultValue={record.mother_maiden_name ?? ""} />
            <SelectField label={t("bloodType")} name="blood_type_code" defaultValue={record.blood_type_code ?? ""} options={BLOOD_TYPES} />
          </FormSection>

          <FormSection title="Info Proses Onboarding">
            <Field label="TA PIC" name="ta_pic_name" defaultValue={record.ta_pic_name ?? ""} required />
            <SelectField label="Status Karyawan" name="employee_status_code" defaultValue={record.employee_status_code ?? ""} options={EMPLOYEE_STATUS} />
            <CheckboxField label="Perlu Laptop" name="needs_laptop" defaultChecked={record.needs_laptop ?? false} />
            <CheckboxField label="Perlu ID Card" name="needs_id_card" defaultChecked={record.needs_id_card ?? false} />
          </FormSection>

          <div className="flex gap-3">
            <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
              {t("saveChanges")}
            </button>
            <Link href={`/hr/${id}`} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {t("cancel")}
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">{title}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{children}</div>
    </section>
  );
}
function CheckboxField({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 pt-6">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="rounded border-slate-300" />
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </label>
  );
}
