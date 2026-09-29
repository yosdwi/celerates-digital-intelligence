import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { onboardingRequests, candidates, requisitions, applications, employees, signatureRequests, opportunities, salesOpportunityTrackers } from "@/db/schema";
import { getPicNames } from "@/lib/reference-data";
import { desc, eq, inArray } from "drizzle-orm";
import { createOnboardingRequest } from "./actions";
import { CandidatePicker } from "@/components/candidate-picker";
import { RequisitionPicker } from "@/components/requisition-picker";
import { ExpandableSection } from "@/components/expandable-section";
import { OnboardingTable } from "./onboarding-table";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AddRecordModal } from "@/components/add-record-modal";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { getAttachmentsWithUrlsForMany, getAttachmentsWithUrlsForManySourceTypes } from "@/lib/attachments";
import { getActiveUserOptions } from "@/lib/approval-journey";
import { CANDIDATE_CV_ASLI_SOURCE } from "../candidates/constants";
import { ONBOARDING_DOC_FIELDS, onboardingDocSource, OFFERING_LETTER_SIGNATURE_SOURCE } from "./constants";
import type { OfferingLetterSignatureInfo } from "./offering-letter-signature-status";
import {
  UserCheck, Briefcase, UserRound, GraduationCap, Phone, Landmark, ShieldCheck,
  IdCard, FolderOpen, Wallet, StickyNote, type LucideIcon,
} from "lucide-react";
import { Field as FieldBase, SelectField as SelectFieldBase } from "@/components/form-fields";
import { PasteRowParser } from "./paste-row-parser";
import { GpaField } from "./gpa-field";

function Field(props: React.ComponentProps<typeof FieldBase>) {
  return <FieldBase rows={2} {...props} />;
}

function SelectField(props: React.ComponentProps<typeof SelectFieldBase>) {
  return <SelectFieldBase {...props} />;
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
const EMPLOYEE_CATEGORIES = [["backoffice", "Backoffice"], ["talent", "Talent"], ["freelance", "Freelance"]] as const;
const JOB_LEVELS = [["internship", "Internship"], ["staff", "Staff"], ["manager", "Manager"], ["head", "Head"], ["chief", "Chief"]] as const;
const GENDERS = [["male", "Laki-laki"], ["female", "Perempuan"]] as const;
const RELIGIONS = [
  ["islam", "Islam"], ["kristen", "Kristen"], ["buddha", "Buddha"], ["hindu", "Hindu"], ["konghucu", "Konghucu"], ["other", "Other"],
] as const;
const PTKP_CODES = [
  ["tk0", "TK/0"], ["tk1", "TK/1"], ["tk2", "TK/2"], ["tk3", "TK/3"],
  ["k0", "K/0"], ["k1", "K/1"], ["k2", "K/2"], ["k3", "K/3"],
  ["ki0", "K/I/0"], ["ki1", "K/I/1"], ["ki2", "K/I/2"], ["ki3", "K/I/3"],
] as const;

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ candidate_id?: string; requisition_id?: string }>;
}) {
  const t = await getTranslations("ta.onboarding.page");
  const params = await searchParams;
  const [
    promotedIds,
    convertedIds,
    rows,
    onboardingApplications,
    requisitionOptions,
    picNames,
    userOptions,
    allOfferingLetterSignatures,
  ] = await Promise.all([
    db.select({ onboarding_request_id: employees.onboarding_request_id }).from(employees),
    db.select({ onboarding_request_id: opportunities.onboarding_request_id }).from(opportunities),
    db
      .select({
        id: onboardingRequests.id,
        created_at: onboardingRequests.created_at,
        candidate_no: candidates.candidate_no,
        candidate_name: candidates.candidate_name,
        client_name: requisitions.client_name,
        position_name: requisitions.position_name,
        ta_pic_name: onboardingRequests.ta_pic_name,
        employee_status_code: onboardingRequests.employee_status_code,
        salary_deal_amount: onboardingRequests.salary_deal_amount,
        start_date: onboardingRequests.start_date,
        end_date: onboardingRequests.end_date,
        basic_salary_amount: onboardingRequests.basic_salary_amount,
        functional_allowance_amount: onboardingRequests.functional_allowance_amount,
        transport_allowance_amount: onboardingRequests.transport_allowance_amount,
        project_allowance_amount: onboardingRequests.project_allowance_amount,
        accommodation_allowance_amount: onboardingRequests.accommodation_allowance_amount,
        field_allowance_amount: onboardingRequests.field_allowance_amount,
        overtime_allowance_amount: onboardingRequests.overtime_allowance_amount,
        offering_letter_path: onboardingRequests.offering_letter_path,
        ktp_file_path: onboardingRequests.ktp_file_path,
        bpjs_kesehatan_file_path: onboardingRequests.bpjs_kesehatan_file_path,
        bpjs_ketenagakerjaan_file_path: onboardingRequests.bpjs_ketenagakerjaan_file_path,
        npwp_file_path: onboardingRequests.npwp_file_path,
        kk_file_path: onboardingRequests.kk_file_path,
        diploma_file_path: onboardingRequests.diploma_file_path,
        certification_file_path: onboardingRequests.certification_file_path,
        formal_photo_file_path: onboardingRequests.formal_photo_file_path,
      })
      .from(onboardingRequests)
      .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
      .leftJoin(requisitions, eq(onboardingRequests.requisition_id, requisitions.id))
      .orderBy(desc(onboardingRequests.created_at)),
    db
      .select({ candidate_id: applications.candidate_id })
      .from(applications)
      .where(eq(applications.hiring_status_code, "onboarding")),
    db.select({
      id: requisitions.id,
      client_name: requisitions.client_name,
      position_name: requisitions.position_name,
      service_type_code: requisitions.service_type_code,
      level_code: requisitions.level_code,
      ta_pic_name: requisitions.ta_pic_name,
    }).from(requisitions),
    getPicNames(),
    getActiveUserOptions(),
    db.select().from(signatureRequests).where(eq(signatureRequests.source_type, OFFERING_LETTER_SIGNATURE_SOURCE)),
  ]);
  const promotedSet = new Set(promotedIds.map((r) => r.onboarding_request_id).filter((id): id is string => id !== null));
  const convertedSet = new Set(convertedIds.map((r) => r.onboarding_request_id).filter((id): id is string => id !== null));
  const eligibleCandidateIds = onboardingApplications.map((a) => a.candidate_id).filter((id): id is string => id !== null);

  const candidateOptions = eligibleCandidateIds.length > 0
    ? await db.select({
        id: candidates.id,
        candidate_no: candidates.candidate_no,
        candidate_name: candidates.candidate_name,
        wa_number: candidates.wa_number,
        email: candidates.email,
        current_salary_amount: candidates.current_salary_amount,
        expected_salary_amount: candidates.expected_salary_amount,
        candidate_source_code: candidates.candidate_source_code,
      }).from(candidates).where(inArray(candidates.id, eligibleCandidateIds))
    : [];

  // Link CV Asli di form Onboarding harus ikut attachment CV asli candidate
  // yang sebenarnya (bukan kolom teks candidates.cv_asli_url yang bisa basi).
  const candidateCvAttachmentsById = await getAttachmentsWithUrlsForMany(CANDIDATE_CV_ASLI_SOURCE, candidateOptions.map((c) => c.id));
  const candidateCvUrlByCandidateId: Record<string, string | null> = {};
  for (const c of candidateOptions) candidateCvUrlByCandidateId[c.id] = candidateCvAttachmentsById[c.id]?.[0]?.url ?? null;

  // Price default diambil dari harga final PQ Tracker (opportunities.price_amount)
  // via requisition -> Opportunity Tracker -> PQ Tracker -- bukan dari
  // Requisition.price_amount sendiri (itu harga awal, bisa beda dari final).
  let defaultPriceAmount: number | null = null;
  let defaultStartDate: string | null = null;
  let defaultEndDate: string | null = null;
  if (params.requisition_id) {
    const [priceRow] = await db
      .select({ price_amount: opportunities.price_amount, start_date: opportunities.start_date, end_date: opportunities.end_date })
      .from(requisitions)
      .innerJoin(salesOpportunityTrackers, eq(requisitions.opportunity_id, salesOpportunityTrackers.id))
      .innerJoin(opportunities, eq(opportunities.opportunity_tracker_id, salesOpportunityTrackers.id))
      .where(eq(requisitions.id, params.requisition_id));
    defaultPriceAmount = priceRow?.price_amount ?? null;
    defaultStartDate = priceRow?.start_date ?? null;
    defaultEndDate = priceRow?.end_date ?? null;
  }

  const userMap = new Map(userOptions.map((u) => [u.id, u]));

  const offeringLetterSigByOnboarding = new Map<string, (typeof allOfferingLetterSignatures)[number]>();
  for (const s of allOfferingLetterSignatures) {
    if (s.source_id) offeringLetterSigByOnboarding.set(s.source_id, s);
  }

  const rowIds = rows.map((r) => r.id);
  // 1 query + 1 batch signed-URL buat semua 9 jenis dokumen sekaligus,
  // bukan 9 query+batch terpisah -- ini yang bikin halaman Onboarding lemot/
  // kadang gagal render kalau datanya udah banyak.
  const attachmentsBySourceType = await getAttachmentsWithUrlsForManySourceTypes(
    ONBOARDING_DOC_FIELDS.map(({ key }) => onboardingDocSource(key)),
    rowIds
  );
  const attachmentsByField = ONBOARDING_DOC_FIELDS.map(({ key, label }) => ({
    label,
    byRow: attachmentsBySourceType[onboardingDocSource(key)],
  }));

  const rowsWithAttachments = rows.map((r) => {
      const docAttachments = attachmentsByField.map(({ label, byRow }) => ({ label, items: byRow[r.id] }));
      const sig = offeringLetterSigByOnboarding.get(r.id);
      const offeringLetterSignature: OfferingLetterSignatureInfo = {
        status: (sig?.status_code as OfferingLetterSignatureInfo["status"]) ?? "not_sent",
        signerName: sig ? userMap.get(sig.signer_user_id)?.full_name ?? null : null,
      };
      return { ...r, docAttachments, offeringLetterSignature };
    });

  const promotedCount = rows.filter((r) => promotedSet.has(r.id)).length;
  const pendingPromoteCount = rows.length - promotedCount;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={UserCheck}
        color="bg-orange-500"
        eyebrow="Talent Acquisition"
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
      />

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label={t("statTotalOnboarding")} value={rows.length} color="navy" />
          <StatCard label={t("statAlreadyEmployee")} value={promotedCount} color="green" />
          <StatCard label={t("statPendingPromote")} value={pendingPromoteCount} color="amber" />
        </div>

        <div className="flex justify-end">
          <AddRecordModal
            buttonLabel={t("addRecordButton")}
            title={t("pageTitle")}
            action={createOnboardingRequest}
            defaultOpen={Boolean(params.candidate_id && params.requisition_id)}
          >
            <div className="sm:col-span-3">
              <ExpandableSection title={t("pasteFromSheetTitle")}>
                <div className="p-4">
                  <PasteRowParser />
                </div>
              </ExpandableSection>
            </div>

            <div className="sm:col-span-3">
              <FormSection step={1} title={t("sectionContract")} icon={Briefcase} color="blue">
                <CandidatePicker candidates={candidateOptions} initialSelectedId={params.candidate_id} candidateCvUrls={candidateCvUrlByCandidateId} />
                <RequisitionPicker
                  requisitions={requisitionOptions}
                  initialSelectedId={params.requisition_id}
                  picNames={picNames}
                  currentPath="/ta/onboarding"
                />
                <Field label={t("fields.salaryDealOffering")} name="salary_deal_amount" money required />
                <SelectField label={t("fields.employeeStatus")} name="employee_status_code" options={EMPLOYEE_STATUS} required />
                <Field label={t("fields.startDate")} name="start_date" type="date" required defaultValue={defaultStartDate ?? ""} />
                <Field label={t("fields.endDate")} name="end_date" type="date" defaultValue={defaultEndDate ?? ""} />
                <CheckboxField label={t("fields.laptop")} name="needs_laptop" />
                <CheckboxField label={t("fields.idCard")} name="needs_id_card" />
              </FormSection>
            </div>

            <div className="sm:col-span-3">
              <FormSection step={2} title={t("sectionPersonalData")} icon={UserRound} color="violet">
                <SubHeading icon={UserRound} label={t("subsections.identity")} first />
                <Field label={t("fields.nik")} name="nik" required digitsOnly />
                <Field label={t("fields.birthPlace")} name="birth_place" />
                <Field label={t("fields.birthDate")} name="birth_date" type="date" />
                <Field label={t("fields.motherMaidenName")} name="mother_maiden_name" />
                <SelectField label={t("fields.bloodType")} name="blood_type_code" options={BLOOD_TYPES} />
                <SelectField label={t("fields.maritalStatus")} name="marital_status_code" options={MARITAL_STATUS} />
                <SelectField label={t("fields.dependentCount")} name="dependent_count" options={[
                  ["0", "0"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"],
                  ["6", "6"], ["7", "7"], ["8", "8"], ["9", "9"], ["10", "10"], ["other", t("fields.other")],
                ]} />
                <div className="sm:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t("fields.idCardAddress")} name="id_card_address" textarea />
                  <Field label={t("fields.currentAddress")} name="current_address" textarea />
                </div>

                <SubHeading icon={GraduationCap} label={t("subsections.education")} />
                <SelectField label={t("fields.educationLevel")} name="education_level_code" options={EDUCATION_LEVELS} />
                <Field label={t("fields.institutionName")} name="institution_name" />
                <Field label={t("fields.major")} name="major" />
                <GpaField label={t("fields.gpa")} name="gpa" />

                <SubHeading icon={Phone} label={t("subsections.contact")} />
                <Field label={t("fields.personalEmail")} name="personal_email" type="email" required />
                <Field label={t("fields.personalPhone")} name="personal_phone" required digitsOnly />
                <Field label={t("fields.availableStartDate")} name="available_start_date" type="date" />
                <Field label={t("fields.emergencyContactName")} name="emergency_contact_name" required />
                <Field label={t("fields.emergencyContactRelationship")} name="emergency_contact_relationship" />
                <Field label={t("fields.emergencyContactPhone")} name="emergency_contact_phone" required digitsOnly />

                <SubHeading icon={Landmark} label={t("subsections.bank")} />
                <Field label={t("fields.bankAccountNo")} name="bank_account_no" required digitsOnly />
                <Field label={t("fields.bankName")} name="bank_name" required />
                <Field label={t("fields.bankAccountHolderName")} name="bank_account_holder_name" />
                <Field label={t("fields.bankBranchName")} name="bank_branch_name" />

                <SubHeading icon={ShieldCheck} label={t("subsections.bpjsAndTax")} />
                <Field label={t("fields.npwp")} name="npwp" digitsOnly />
                <Field label={t("fields.familyCardNo")} name="family_card_no" digitsOnly />
                <Field label={t("fields.bpjsKesehatanNo")} name="bpjs_kesehatan_personal_no" digitsOnly />
                <CheckboxField label={t("fields.bpjsKesehatanWillingTransfer")} name="bpjs_kesehatan_willing_transfer" />
                <Field label={t("fields.bpjsKetenagakerjaanNo")} name="bpjs_ketenagakerjaan_personal_no" digitsOnly />
                <SelectField label={t("fields.employmentType")} name="employment_type_code" options={EMPLOYMENT_TYPES} required />
              </FormSection>
            </div>

            <div className="sm:col-span-3">
              <FormSection step={3} title={t("sectionEmployeeDataForPromote")} icon={IdCard} color="cyan">
                <SelectField label={t("fields.employeeCategory")} name="employee_category_code" options={EMPLOYEE_CATEGORIES} />
                <SelectField label={t("fields.jobLevel")} name="job_level_code" options={JOB_LEVELS} />
                <Field label={t("fields.companyEmail")} name="company_email" type="email" />
                <SelectField label={t("fields.gender")} name="gender_code" options={GENDERS} />
                <SelectField label={t("fields.religion")} name="religion_code" options={RELIGIONS} />
                <SelectField label={t("fields.ptkpCode")} name="ptkp_code" options={PTKP_CODES} />
              </FormSection>
            </div>

            <div className="sm:col-span-3">
              <FormSection step={4} title={t("sectionDocuments")} icon={FolderOpen} color="rose">
                <MultiFileUpload name="offering_letter_attachments" label={t("docs.offeringLetter")} />
                <MultiFileUpload name="ktp_attachments" label={t("docs.ktp")} />
                <MultiFileUpload name="bpjs_kesehatan_attachments" label={t("docs.bpjsKesehatan")} />
                <MultiFileUpload name="bpjs_ketenagakerjaan_attachments" label={t("docs.bpjsKetenagakerjaan")} />
                <MultiFileUpload name="npwp_attachments" label={t("docs.npwp")} />
                <MultiFileUpload name="kk_attachments" label={t("docs.kk")} />
                <MultiFileUpload name="diploma_attachments" label={t("docs.diploma")} />
                <MultiFileUpload name="certification_attachments" label={t("docs.certification")} />
                <MultiFileUpload name="formal_photo_attachments" label={t("docs.formalPhoto")} />
              </FormSection>
            </div>

            <div className="sm:col-span-3">
              <FormSection step={5} title={t("sectionCompensation")} icon={Wallet} color="emerald">
                <Field label={t("fields.price")} name="price_amount" money defaultValue={defaultPriceAmount?.toString() ?? ""} />
                <Field label={t("fields.basicSalary")} name="basic_salary_amount" money />
                <Field label={t("fields.functionalAllowance")} name="functional_allowance_amount" money />
                <Field label={t("fields.transportAllowance")} name="transport_allowance_amount" money />
                <Field label={t("fields.projectAllowance")} name="project_allowance_amount" money />
                <Field label={t("fields.accommodationAllowance")} name="accommodation_allowance_amount" money />
                <Field label={t("fields.fieldAllowance")} name="field_allowance_amount" money />
                <Field label={t("fields.overtime")} name="overtime_allowance_amount" money />
              </FormSection>
            </div>

            <div className="sm:col-span-3">
              <FormSection step={6} title={t("sectionNotes")} icon={StickyNote} color="slate">
                <div className="sm:col-span-3">
                  <Field label={t("fields.notes")} name="notes" textarea />
                </div>
              </FormSection>
            </div>
          </AddRecordModal>
        </div>

        <ExpandableSection title={t("listTitle", { count: rows.length })}>
          <OnboardingTable data={rowsWithAttachments} promotedIds={[...promotedSet]} convertedIds={[...convertedSet]} userOptions={userOptions} />
        </ExpandableSection>
      </main>
    </div>
  );
}

const SECTION_COLORS = {
  blue: { chip: "bg-blue-100 text-blue-600", header: "bg-blue-50/70 border-blue-100", title: "text-blue-900" },
  violet: { chip: "bg-violet-100 text-violet-600", header: "bg-violet-50/70 border-violet-100", title: "text-violet-900" },
  cyan: { chip: "bg-cyan-100 text-cyan-600", header: "bg-cyan-50/70 border-cyan-100", title: "text-cyan-900" },
  rose: { chip: "bg-rose-100 text-rose-600", header: "bg-rose-50/70 border-rose-100", title: "text-rose-900" },
  emerald: { chip: "bg-emerald-100 text-emerald-600", header: "bg-emerald-50/70 border-emerald-100", title: "text-emerald-900" },
  slate: { chip: "bg-slate-200 text-slate-600", header: "bg-slate-50 border-slate-200", title: "text-slate-800" },
} as const;

/**
 * Kartu section bernomor + ikon warna, bukan cuma kotak abu-abu polos --
 * form Onboarding ini panjang banget (~50 field), tanpa penanda visual yang
 * jelas per section jadi susah tau lagi ngisi bagian mana ("berantakan").
 */
function FormSection({
  step, title, icon: Icon, color, children,
}: { step: number; title: string; icon: LucideIcon; color: keyof typeof SECTION_COLORS; children: React.ReactNode }) {
  const c = SECTION_COLORS[color];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className={`flex items-center gap-3 border-b px-5 py-3.5 ${c.header}`}>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${c.chip}`}>
          <Icon className="h-4 w-4" />
        </span>
        <h3 className={`text-sm font-semibold ${c.title}`}>{step}. {title}</h3>
      </div>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">{children}</div>
    </section>
  );
}

/** Pembatas visual antar kelompok field di dalam satu FormSection yang panjang
 *  (mis. Data Pribadi: identitas / pendidikan / kontak / bank / BPJS). */
function SubHeading({ label, icon: Icon, first }: { label: string; icon: LucideIcon; first?: boolean }) {
  return (
    <div className={`sm:col-span-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 ${first ? "" : "border-t border-slate-100 pt-4"}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

function CheckboxField({ label, name }: { label: string; name: string }) {
  return (
    <label className="flex items-center gap-2 pt-6">
      <input name={name} type="checkbox" className="rounded border-slate-300" />
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </label>
  );
}
