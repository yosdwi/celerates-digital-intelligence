import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { onboardingRequests, candidates, requisitions, opportunities, salesOpportunityTrackers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { updateOnboardingRequest, deleteOnboardingAttachment } from "../../actions";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { getAttachmentsWithUrlsForManySourceTypes } from "@/lib/attachments";
import { getPicNames } from "@/lib/reference-data";
import { decryptPII } from "@/lib/pii-crypto";
import { ONBOARDING_DOC_FIELDS, onboardingDocSource } from "../../constants";
import { RequisitionPicker } from "@/components/requisition-picker";
import Link from "next/link";
import { Field as FieldBase, SelectField } from "@/components/form-fields";
import { PageHeader } from "@/components/page-header";
import { Pencil } from "lucide-react";
import { GpaField } from "../../gpa-field";

function Field(props: React.ComponentProps<typeof FieldBase>) {
  return <FieldBase rows={2} {...props} />;
}


const EMPLOYEE_STATUS = [
  ["new_hire", "New Hire"], ["replacement", "Replacement"], ["internal", "Internal"],
  ["freelance", "Freelance"], ["bootcamp", "Bootcamp"],
] as const;
const EDUCATION_LEVELS = [
  ["s3", "S3"], ["s2", "S2"], ["s1", "S1"], ["d4", "D4"], ["d3", "D3"], ["sma_smk", "SMA/SMK"],
] as const;
const MARITAL_STATUS = [["belum_kawin", "Belum Kawin"], ["kawin", "Kawin"]] as const;
const BLOOD_TYPES = [
  ["a_plus", "A+"], ["a_minus", "A-"], ["b_plus", "B+"], ["b_minus", "B-"],
  ["ab_plus", "AB+"], ["ab_minus", "AB-"], ["o_plus", "O+"], ["o_minus", "O-"], ["belum_periksa", "Belum Periksa"],
] as const;
const EMPLOYMENT_TYPES = [
  ["pkwt", "Kontrak (PKWT)"], ["freelance", "Freelance"], ["internship", "Internship"], ["pkwtt", "Tetap (PKWTT)"],
] as const;

export default async function EditOnboardingPage({
    params,
    searchParams,
  }: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ returnTo?: string }>;
  }) {
    const t = await getTranslations("ta.onboarding.editPage");
    const { returnTo } = await searchParams;
  const { id } = await params;
  const [record] = await db.select().from(onboardingRequests).where(eq(onboardingRequests.id, id));
  if (!record) notFound();

  // Kalau price_amount belum pernah diisi manual, default-kan dari harga
  // final PQ Tracker (opportunities.price_amount) via requisition -> Opportunity
  // Tracker -> PQ Tracker -- tidak menimpa nilai yang sudah diisi sebelumnya.
  let defaultPriceAmount = record.price_amount;
  if (defaultPriceAmount == null && record.requisition_id) {
    const [priceRow] = await db
      .select({ price_amount: opportunities.price_amount })
      .from(requisitions)
      .innerJoin(salesOpportunityTrackers, eq(requisitions.opportunity_id, salesOpportunityTrackers.id))
      .innerJoin(opportunities, eq(opportunities.opportunity_tracker_id, salesOpportunityTrackers.id))
      .where(eq(requisitions.id, record.requisition_id));
    defaultPriceAmount = priceRow?.price_amount ?? null;
  }

  const [[candidate], requisitionOptions, attachmentsBySourceType, picNames] = await Promise.all([
    db.select().from(candidates).where(eq(candidates.id, record.candidate_id ?? "")),
    db.select({
      id: requisitions.id,
      client_name: requisitions.client_name,
      position_name: requisitions.position_name,
      service_type_code: requisitions.service_type_code,
      level_code: requisitions.level_code,
      ta_pic_name: requisitions.ta_pic_name,
    }).from(requisitions),
    getAttachmentsWithUrlsForManySourceTypes(
      ONBOARDING_DOC_FIELDS.map(({ key }) => onboardingDocSource(key)),
      [id]
    ),
    getPicNames(),
  ]);

  const updateWithId = updateOnboardingRequest.bind(null, id);
  const docAttachmentsByKey = new Map(
    ONBOARDING_DOC_FIELDS.map(({ key }) => [key, attachmentsBySourceType[onboardingDocSource(key)][id]] as const)
  );
  {returnTo && <input type="hidden" name="return_to" value={returnTo} />}

  return (
    <div className="min-h-screen">
      <PageHeader icon={Pencil} color="bg-amber-500" eyebrow="Talent Acquisition" title={t("pageTitle", { name: candidate?.candidate_name ?? "-" })}>
        <Link href="/ta/onboarding" className="text-sm font-medium text-amber-700 hover:underline">&larr; {t("backToList")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-5xl mx-auto space-y-8">
        <form action={updateWithId} className="space-y-8">
          <FormSection title={t("sectionContract")}>
            <RequisitionPicker
              requisitions={requisitionOptions}
              initialSelectedId={record.requisition_id ?? undefined}
              picNames={picNames}
              currentPath={`/ta/onboarding/${id}/edit`}
              fallbackTaPicName={record.ta_pic_name}
            />
            <Field label={t("fields.salaryDealOffering")} name="salary_deal_amount" money defaultValue={record.salary_deal_amount?.toString() ?? ""} />
            <SelectField label={t("fields.employeeStatus")} name="employee_status_code" defaultValue={record.employee_status_code ?? ""} options={EMPLOYEE_STATUS} />
            <Field label={t("fields.startDate")} name="start_date" type="date" defaultValue={record.start_date ?? ""} />
            <Field label={t("fields.endDate")} name="end_date" type="date" defaultValue={record.end_date ?? ""} />
            <CheckboxField label={t("fields.laptop")} name="needs_laptop" defaultChecked={record.needs_laptop} />
            <CheckboxField label={t("fields.idCard")} name="needs_id_card" defaultChecked={record.needs_id_card} />
          </FormSection>

          <FormSection title={t("sectionPersonalData")}>
            <Field label={t("fields.nik")} name="nik" defaultValue={decryptPII(record.nik) ?? ""} digitsOnly />
            <Field label={t("fields.birthPlace")} name="birth_place" defaultValue={record.birth_place ?? ""} />
            <Field label={t("fields.birthDate")} name="birth_date" type="date" defaultValue={record.birth_date ?? ""} />
            <Field label={t("fields.idCardAddress")} name="id_card_address" defaultValue={record.id_card_address ?? ""} textarea />
            <Field label={t("fields.currentAddress")} name="current_address" defaultValue={record.current_address ?? ""} textarea />
            <SelectField label={t("fields.educationLevel")} name="education_level_code" defaultValue={record.education_level_code ?? ""} options={EDUCATION_LEVELS} />
            <Field label={t("fields.institutionName")} name="institution_name" defaultValue={record.institution_name ?? ""} />
            <Field label={t("fields.major")} name="major" defaultValue={record.major ?? ""} />
            <GpaField label={t("fields.gpa")} name="gpa" defaultValue={record.gpa ?? ""} />
            <Field label={t("fields.personalEmail")} name="personal_email" type="email" defaultValue={record.personal_email ?? ""} />
            <Field label={t("fields.personalPhone")} name="personal_phone" defaultValue={record.personal_phone ?? ""} digitsOnly />
            <Field label={t("fields.npwp")} name="npwp" defaultValue={decryptPII(record.npwp) ?? ""} digitsOnly />
            <Field label={t("fields.familyCardNo")} name="family_card_no" defaultValue={decryptPII(record.family_card_no) ?? ""} digitsOnly />
            <SelectField label={t("fields.maritalStatus")} name="marital_status_code" defaultValue={record.marital_status_code ?? ""} options={MARITAL_STATUS} />
            <SelectField
              label={t("fields.dependentCount")} name="dependent_count"
              defaultValue={record.dependent_count?.toString() ?? ""}
              options={[["0","0"],["1","1"],["2","2"],["3","3"],["4","4"],["5","5"],["6","6"],["7","7"],["8","8"],["9","9"],["10","10"],["other",t("fields.other")]]}
            />
            <Field label={t("fields.bankAccountNo")} name="bank_account_no" defaultValue={decryptPII(record.bank_account_no) ?? ""} digitsOnly />
            <Field label={t("fields.bankName")} name="bank_name" defaultValue={record.bank_name ?? ""} />
            <Field label={t("fields.bankAccountHolderName")} name="bank_account_holder_name" defaultValue={record.bank_account_holder_name ?? ""} />
            <Field label={t("fields.bankBranchName")} name="bank_branch_name" defaultValue={record.bank_branch_name ?? ""} />
            <Field label={t("fields.bpjsKesehatanNo")} name="bpjs_kesehatan_personal_no" defaultValue={record.bpjs_kesehatan_personal_no ?? ""} digitsOnly />
            <CheckboxField label={t("fields.bpjsKesehatanWillingTransfer")} name="bpjs_kesehatan_willing_transfer" defaultChecked={record.bpjs_kesehatan_willing_transfer ?? false} />
            <Field label={t("fields.bpjsKetenagakerjaanNo")} name="bpjs_ketenagakerjaan_personal_no" defaultValue={record.bpjs_ketenagakerjaan_personal_no ?? ""} digitsOnly />
            <Field label={t("fields.emergencyContactName")} name="emergency_contact_name" defaultValue={record.emergency_contact_name ?? ""} />
            <Field label={t("fields.emergencyContactRelationship")} name="emergency_contact_relationship" defaultValue={record.emergency_contact_relationship ?? ""} />
            <Field label={t("fields.emergencyContactPhone")} name="emergency_contact_phone" defaultValue={record.emergency_contact_phone ?? ""} digitsOnly />
            <Field label={t("fields.availableStartDate")} name="available_start_date" type="date" defaultValue={record.available_start_date ?? ""} />
            <Field label={t("fields.motherMaidenName")} name="mother_maiden_name" defaultValue={record.mother_maiden_name ?? ""} />
            <SelectField label={t("fields.bloodType")} name="blood_type_code" defaultValue={record.blood_type_code ?? ""} options={BLOOD_TYPES} />
            <SelectField label={t("fields.employmentType")} name="employment_type_code" defaultValue={record.employment_type_code ?? ""} options={EMPLOYMENT_TYPES} />
          </FormSection>

          <FormSection title={t("sectionDocuments")}>
            {record.offering_letter_path && <p className="text-xs text-green-600 sm:col-span-3 -mb-2">{t("offeringLetterLegacyNote")}</p>}
            <MultiFileUpload
              name="offering_letter_attachments"
              label={t("docs.offeringLetter")}
              existingFiles={(docAttachmentsByKey.get("offering_letter") ?? []).map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
              onDeleteExisting={deleteOnboardingAttachment}
            />
            <MultiFileUpload
              name="ktp_attachments"
              label={t("docs.ktp")}
              existingFiles={(docAttachmentsByKey.get("ktp") ?? []).map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
              onDeleteExisting={deleteOnboardingAttachment}
            />
            <MultiFileUpload
              name="bpjs_kesehatan_attachments"
              label={t("docs.bpjsKesehatan")}
              existingFiles={(docAttachmentsByKey.get("bpjs_kesehatan") ?? []).map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
              onDeleteExisting={deleteOnboardingAttachment}
            />
            <MultiFileUpload
              name="bpjs_ketenagakerjaan_attachments"
              label={t("docs.bpjsKetenagakerjaan")}
              existingFiles={(docAttachmentsByKey.get("bpjs_ketenagakerjaan") ?? []).map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
              onDeleteExisting={deleteOnboardingAttachment}
            />
            <MultiFileUpload
              name="npwp_attachments"
              label={t("docs.npwp")}
              existingFiles={(docAttachmentsByKey.get("npwp") ?? []).map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
              onDeleteExisting={deleteOnboardingAttachment}
            />
            <MultiFileUpload
              name="kk_attachments"
              label={t("docs.kk")}
              existingFiles={(docAttachmentsByKey.get("kk") ?? []).map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
              onDeleteExisting={deleteOnboardingAttachment}
            />
            <MultiFileUpload
              name="diploma_attachments"
              label={t("docs.diploma")}
              existingFiles={(docAttachmentsByKey.get("diploma") ?? []).map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
              onDeleteExisting={deleteOnboardingAttachment}
            />
            <MultiFileUpload
              name="certification_attachments"
              label={t("docs.certification")}
              existingFiles={(docAttachmentsByKey.get("certification") ?? []).map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
              onDeleteExisting={deleteOnboardingAttachment}
            />
            <MultiFileUpload
              name="formal_photo_attachments"
              label={t("docs.formalPhoto")}
              existingFiles={(docAttachmentsByKey.get("formal_photo") ?? []).map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
              onDeleteExisting={deleteOnboardingAttachment}
            />
          </FormSection>

          <FormSection title={t("sectionCompensation")}>
            <Field label={t("fields.price")} name="price_amount" money defaultValue={defaultPriceAmount?.toString() ?? ""} />
            <Field label={t("fields.basicSalary")} name="basic_salary_amount" money defaultValue={record.basic_salary_amount?.toString() ?? ""} />
            <Field label={t("fields.functionalAllowance")} name="functional_allowance_amount" money defaultValue={record.functional_allowance_amount?.toString() ?? ""} />
            <Field label={t("fields.transportAllowance")} name="transport_allowance_amount" money defaultValue={record.transport_allowance_amount?.toString() ?? ""} />
            <Field label={t("fields.projectAllowance")} name="project_allowance_amount" money defaultValue={record.project_allowance_amount?.toString() ?? ""} />
            <Field label={t("fields.accommodationAllowance")} name="accommodation_allowance_amount" money defaultValue={record.accommodation_allowance_amount?.toString() ?? ""} />
            <Field label={t("fields.fieldAllowance")} name="field_allowance_amount" money defaultValue={record.field_allowance_amount?.toString() ?? ""} />
            <Field label={t("fields.overtime")} name="overtime_allowance_amount" money defaultValue={record.overtime_allowance_amount?.toString() ?? ""} />
          </FormSection>

          <div>
            <Field label={t("fields.notes")} name="notes" defaultValue={record.notes ?? ""} textarea />
          </div>

          <div className="flex gap-3">
            <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
              {t("saveChanges")}
            </button>
            <Link href="/ta/onboarding" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
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
