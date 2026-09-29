"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { onboardingRequests, signatureRequests } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { employees, employmentContracts, bpjsRegistrations, candidates, requisitions } from "@/db/schema";
import { redirect } from "next/navigation";
import { markSaved } from "@/lib/saved-flag";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { createNotification } from "@/lib/notifications";
import { saveAttachmentsAndLinks, extractFiles, extractLinks, deleteAttachment, getAttachmentsWithUrls } from "@/lib/attachments";
import { ONBOARDING_DOC_FIELDS, onboardingDocSource, OFFERING_LETTER_SIGNATURE_SOURCE, OFFERING_LETTER_SIGNATURE_STEP } from "./constants";
import { onTalentPromoted } from "@/lib/pq-approval";
import { encryptPII } from "@/lib/pii-crypto";
import { requireDivisionAccess } from "@/lib/require-division-access";

async function saveOnboardingDocAttachments(onboardingRequestId: string, formData: FormData, uploadedByName: string | null) {
  for (const { key } of ONBOARDING_DOC_FIELDS) {
    const files = extractFiles(formData, `${key}_attachments`);
    const links = extractLinks(formData, `${key}_attachments_links`);
    if (files.length > 0 || links.length > 0) {
      await saveAttachmentsAndLinks(onboardingDocSource(key), onboardingRequestId, { files, links }, uploadedByName);
    }
  }
}

export type SendOfferingLetterResult = { ok: true } | { ok: false; error: string };

/** Kirim Offering Letter yang sudah diupload ke TTD Online buat ditandatangani HR (1 signer). */
export async function sendOfferingLetterForSignature(onboardingRequestId: string, formData: FormData): Promise<SendOfferingLetterResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("ta");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const session = await getServerSession(authOptions);
  const requesterId = (session?.user as any)?.id as string | undefined;
  const requesterName = (session?.user as any)?.fullName ?? session?.user?.name ?? "Seseorang";
  if (!requesterId) return { ok: false, error: "Belum login" };

  const signer_user_id = formData.get("signer_user_id") as string;
  if (!signer_user_id) return { ok: false, error: "Signer wajib dipilih" };

  const existing = await db.select().from(signatureRequests).where(and(
    eq(signatureRequests.source_type, OFFERING_LETTER_SIGNATURE_SOURCE),
    eq(signatureRequests.source_id, onboardingRequestId)
  ));
  if (existing.some((r) => r.status_code === "pending" || r.status_code === "signed")) {
    return { ok: false, error: "Offering Letter ini sudah pernah dikirim untuk TTD" };
  }

  const [onboarding] = await db.select().from(onboardingRequests).where(eq(onboardingRequests.id, onboardingRequestId));
  if (!onboarding) return { ok: false, error: "Onboarding request tidak ditemukan" };
  const [candidate] = onboarding.candidate_id ? await db.select().from(candidates).where(eq(candidates.id, onboarding.candidate_id)) : [undefined];
  const candidateName = candidate?.candidate_name ?? "Talent";

  const newFiles = extractFiles(formData, "offering_letter_attachments");
  const newLinks = extractLinks(formData, "offering_letter_attachments_links");
  if (newFiles.length > 0 || newLinks.length > 0) {
    await saveAttachmentsAndLinks(onboardingDocSource("offering_letter"), onboardingRequestId, { files: newFiles, links: newLinks }, requesterName);
  }

  const existingDocs = await getAttachmentsWithUrls(onboardingDocSource("offering_letter"), onboardingRequestId);
  if (existingDocs.length === 0) {
    return { ok: false, error: "Upload dokumen Offering Letter dulu sebelum kirim ke TTD" };
  }

  await db.insert(signatureRequests).values({
    document_title: `Offering Letter - ${candidateName}`,
    requested_by_user_id: requesterId,
    signer_user_id,
    source_type: OFFERING_LETTER_SIGNATURE_SOURCE,
    source_id: onboardingRequestId,
    step_code: OFFERING_LETTER_SIGNATURE_STEP,
    step_order: 0,
  });

  await createNotification(
    signer_user_id,
    "Permintaan Tanda Tangan Offering Letter",
    `${requesterName} meminta Anda menandatangani Offering Letter untuk "${candidateName}".`,
    "/ttd-online"
  );

  await logActivity("ta", "create", `Offering Letter dikirim untuk TTD: ${candidateName}`, "Onboarding");
  revalidatePath("/ta/onboarding");
  return { ok: true };
}

export async function deleteOnboardingAttachment(attachmentId: string) {
  await requirePilotActor();

  await requireDivisionAccess("ta");
  await deleteAttachment(attachmentId);
  await logActivity("ta", "delete", "Lampiran dokumen onboarding dihapus", "Onboarding");
  revalidatePath("/ta/onboarding");
}

export async function createOnboardingRequest(formData: FormData): Promise<void> {
  await requirePilotActor();

  await requireDivisionAccess("ta");
  const candidate_id = formData.get("candidate_id") as string;
  if (!candidate_id) throw new Error("Candidate wajib dipilih");

  const get = (name: string) => (formData.get(name) as string) || null;
  const getNum = (name: string) => {
    const v = formData.get(name) as string;
    return v ? Number(v) : null;
  };
  const getBool = (name: string) => formData.get(name) === "on";

  // Wajib diisi supaya proses onboarding (kontrak, payroll, promote ke
  // Employee) nggak jalan dengan data personal/kontrak yang bolong.
  // end_date sengaja tidak wajib -- kontrak PKWTT emang nggak punya tanggal akhir.
  const start_date = get("start_date");
  if (!start_date) throw new Error("Tanggal mulai (start date) wajib diisi");
  const employee_status_code = get("employee_status_code");
  if (!employee_status_code) throw new Error("Employee Status wajib diisi");
  const employment_type_code = get("employment_type_code");
  if (!employment_type_code) throw new Error("Status Karyawan (employment type) wajib diisi");
  const salary_deal_amount = getNum("salary_deal_amount");
  if (!salary_deal_amount) throw new Error("Salary Deal / Offering wajib diisi");
  const nik = get("nik");
  if (!nik) throw new Error("NIK wajib diisi");
  const personal_email = get("personal_email");
  if (!personal_email) throw new Error("Alamat email aktif wajib diisi");
  const personal_phone = get("personal_phone");
  if (!personal_phone) throw new Error("Nomor handphone aktif wajib diisi");
  const bank_name = get("bank_name");
  if (!bank_name) throw new Error("Nama Bank wajib diisi");
  const bank_account_no = get("bank_account_no");
  if (!bank_account_no) throw new Error("Nomor Rekening Bank wajib diisi");
  const emergency_contact_name = get("emergency_contact_name");
  if (!emergency_contact_name) throw new Error("Kontak Darurat - Nama wajib diisi");
  const emergency_contact_phone = get("emergency_contact_phone");
  if (!emergency_contact_phone) throw new Error("Kontak Darurat - No. Telp wajib diisi");

  const [{ id: newId }] = await db.insert(onboardingRequests).values({
    candidate_id,
    requisition_id: get("requisition_id"),
    ta_pic_name: get("ta_pic_name") ?? "",
    salary_deal_amount,
    employee_status_code,
    start_date,
    end_date: get("end_date"),
    needs_laptop: getBool("needs_laptop"),
    needs_id_card: getBool("needs_id_card"),
    nik: encryptPII(nik),
    birth_place: get("birth_place"),
    birth_date: get("birth_date"),
    id_card_address: get("id_card_address"),
    current_address: get("current_address"),
    education_level_code: get("education_level_code"),
    institution_name: get("institution_name"),
    major: get("major"),
    gpa: get("gpa"),
    personal_email,
    personal_phone,
    npwp: encryptPII(get("npwp")),
    family_card_no: encryptPII(get("family_card_no")),
    marital_status_code: get("marital_status_code"),
    dependent_count: getNum("dependent_count"),
    bank_account_no: encryptPII(bank_account_no),
    bank_name,
    bank_account_holder_name: get("bank_account_holder_name"),
    bank_branch_name: get("bank_branch_name"),
    bpjs_kesehatan_personal_no: get("bpjs_kesehatan_personal_no"),
    bpjs_kesehatan_willing_transfer: getBool("bpjs_kesehatan_willing_transfer"),
    bpjs_ketenagakerjaan_personal_no: get("bpjs_ketenagakerjaan_personal_no"),
    emergency_contact_name,
    emergency_contact_relationship: get("emergency_contact_relationship"),
    emergency_contact_phone,
    available_start_date: get("available_start_date"),
    mother_maiden_name: get("mother_maiden_name"),
    blood_type_code: get("blood_type_code"),
    employment_type_code,
    employee_category_code: get("employee_category_code"),
    job_level_code: get("job_level_code"),
    company_email: get("company_email"),
    gender_code: get("gender_code"),
    religion_code: get("religion_code"),
    ptkp_code: get("ptkp_code"),
    price_amount: getNum("price_amount"),
    basic_salary_amount: getNum("basic_salary_amount"),
    functional_allowance_amount: getNum("functional_allowance_amount"),
    transport_allowance_amount: getNum("transport_allowance_amount"),
    project_allowance_amount: getNum("project_allowance_amount"),
    accommodation_allowance_amount: getNum("accommodation_allowance_amount"),
    field_allowance_amount: getNum("field_allowance_amount"),
    overtime_allowance_amount: getNum("overtime_allowance_amount"),
    notes: get("notes"),
  }).returning({ id: onboardingRequests.id });

  await saveOnboardingDocAttachments(newId, formData, get("ta_pic_name"));

  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, candidate_id));
  await logActivity("ta", "create", `Onboarding Request: ${candidate?.candidate_name ?? candidate_id}`, "Onboarding");
  revalidatePath("/ta/onboarding");
}

export async function getDocumentSignedUrl(path: string | null): Promise<string | null> {
  await requirePilotActor();

  if (!path) return null;
  const { getDocumentUrl } = await import("@/lib/storage");
  return getDocumentUrl(path);
}


async function generateEmployeeNo(categoryCode: string): Promise<string> {
  const now = new Date();
  const typeSlug = categoryCode.slice(0, 2).toUpperCase();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  for (let i = 0; i < 5; i++) {
    const seq = String(Math.floor(1 + Math.random() * 99)).padStart(2, "0");
    const candidate = `MTG-${typeSlug}/${ymd}${seq}`;
    const existing = await db.select().from(employees).where(eq(employees.employee_no, candidate));
    if (existing.length === 0) return candidate;
  }
  return `MTG-${typeSlug}/${ymd}${Date.now()}`;
}

async function generateContractNo(employmentTypeCode: string): Promise<string> {
  const now = new Date();
  const romans = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
  const roman = romans[now.getMonth()];
  for (let i = 0; i < 5; i++) {
    const seq = Math.floor(100 + Math.random() * 900);
    const candidate = `${seq}/${employmentTypeCode.toUpperCase()}/MTG.01/${roman}/${now.getFullYear()}`;
    const existing = await db.select().from(employmentContracts).where(eq(employmentContracts.contract_no, candidate));
    if (existing.length === 0) return candidate;
  }
  return `${Date.now()}/${employmentTypeCode.toUpperCase()}/MTG.01/${roman}/${now.getFullYear()}`;
}

export type PromoteResult = { ok: true } | { ok: false; error: string };

export async function promoteToEmployee(onboardingRequestId: string): Promise<PromoteResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("ta");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const [onboarding] = await db.select().from(onboardingRequests).where(eq(onboardingRequests.id, onboardingRequestId));
  if (!onboarding) return { ok: false, error: "Onboarding request tidak ditemukan" };

  const existing = await db.select().from(employees).where(eq(employees.onboarding_request_id, onboardingRequestId));
  if (existing.length > 0) return { ok: false, error: "Sudah pernah di-promote jadi Employee" };

  // Semua data ini sekarang diisi lebih awal di form intake Onboarding
  // (bukan ditanya lagi lewat modal Promote) -- diambil langsung dari
  // record onboarding & requisition yang di-link, bukan dari FormData.
  const [requisition] = onboarding.requisition_id
    ? await db.select().from(requisitions).where(eq(requisitions.id, onboarding.requisition_id))
    : [undefined];

  const { employee_category_code, job_level_code, company_email, gender_code, religion_code, ptkp_code, employment_type_code, start_date, end_date } = onboarding;
  const position_name = requisition?.position_name ?? "";

  if (!employee_category_code || !job_level_code || !company_email || !gender_code || !religion_code || !employment_type_code || !start_date) {
    return {
      ok: false,
      error: "Lengkapi dulu data Kategori Karyawan, Jabatan, Email Perusahaan, Jenis Kelamin, Agama, Status Karyawan, dan Start Date di form Onboarding Request sebelum promote.",
    };
  }

  const employee_no = await generateEmployeeNo(employee_category_code);
  const contract_no = await generateContractNo(employment_type_code);

  const employee = await db.transaction(async (tx) => {
    const [employee] = await tx.insert(employees).values({
      onboarding_request_id: onboardingRequestId,
      employee_no,
      employee_category_code,
      job_level_code,
      position_name,
      company_email,
      join_date: start_date,
      gender_code,
      religion_code,
      ptkp_code: ptkp_code || null,
      ptkp_effective_year: new Date().getFullYear(),
    }).returning();

    await tx.insert(employmentContracts).values({
      employee_id: employee.id,
      contract_no,
      start_date,
      end_date: end_date || null,
      duration_months: null,
      employment_type_code,
    });

    await tx.insert(bpjsRegistrations).values([
      { employee_id: employee.id, scheme: "kesehatan", status_code: "belum_terdaftar" },
      { employee_id: employee.id, scheme: "ketenagakerjaan", status_code: "belum_terdaftar" },
    ]);

    return employee;
  });

  await onTalentPromoted(onboardingRequestId);

  await logActivity("ta", "update", `Promote ke Employee: ${employee.employee_no}`, "Onboarding");
  await logActivity("hr", "create", `Employee baru: ${employee.employee_no} — ${position_name}`, "Employee");
  revalidatePath("/ta/onboarding");
  revalidatePath("/hr");
  revalidatePath("/tm");
  revalidatePath("/pmo/contracts");
  return { ok: true };
}

export async function updateOnboardingRequest(id: string, formData: FormData): Promise<void> {
  await requirePilotActor();

  await requireDivisionAccess("ta");
  const get = (name: string) => (formData.get(name) as string) || null;
  const getNum = (name: string) => {
    const v = formData.get(name) as string;
    return v ? Number(v) : null;
  };
  const getBool = (name: string) => formData.get(name) === "on";

  await db.update(onboardingRequests).set({
    requisition_id: get("requisition_id"),
    ta_pic_name: get("ta_pic_name") ?? "",
    salary_deal_amount: getNum("salary_deal_amount"),
    employee_status_code: get("employee_status_code"),
    start_date: get("start_date"),
    end_date: get("end_date"),
    needs_laptop: getBool("needs_laptop"),
    needs_id_card: getBool("needs_id_card"),
    nik: encryptPII(get("nik")),
    birth_place: get("birth_place"),
    birth_date: get("birth_date"),
    id_card_address: get("id_card_address"),
    current_address: get("current_address"),
    education_level_code: get("education_level_code"),
    institution_name: get("institution_name"),
    major: get("major"),
    gpa: get("gpa"),
    personal_email: get("personal_email"),
    personal_phone: get("personal_phone"),
    npwp: encryptPII(get("npwp")),
    family_card_no: encryptPII(get("family_card_no")),
    marital_status_code: get("marital_status_code"),
    dependent_count: getNum("dependent_count"),
    bank_account_no: encryptPII(get("bank_account_no")),
    bank_name: get("bank_name"),
    bank_account_holder_name: get("bank_account_holder_name"),
    bank_branch_name: get("bank_branch_name"),
    bpjs_kesehatan_personal_no: get("bpjs_kesehatan_personal_no"),
    bpjs_kesehatan_willing_transfer: getBool("bpjs_kesehatan_willing_transfer"),
    bpjs_ketenagakerjaan_personal_no: get("bpjs_ketenagakerjaan_personal_no"),
    emergency_contact_name: get("emergency_contact_name"),
    emergency_contact_relationship: get("emergency_contact_relationship"),
    emergency_contact_phone: get("emergency_contact_phone"),
    available_start_date: get("available_start_date"),
    mother_maiden_name: get("mother_maiden_name"),
    blood_type_code: get("blood_type_code"),
    employment_type_code: get("employment_type_code"),
    employee_category_code: get("employee_category_code"),
    job_level_code: get("job_level_code"),
    company_email: get("company_email"),
    gender_code: get("gender_code"),
    religion_code: get("religion_code"),
    ptkp_code: get("ptkp_code"),
    price_amount: getNum("price_amount"),
    basic_salary_amount: getNum("basic_salary_amount"),
    functional_allowance_amount: getNum("functional_allowance_amount"),
    transport_allowance_amount: getNum("transport_allowance_amount"),
    project_allowance_amount: getNum("project_allowance_amount"),
    accommodation_allowance_amount: getNum("accommodation_allowance_amount"),
    field_allowance_amount: getNum("field_allowance_amount"),
    overtime_allowance_amount: getNum("overtime_allowance_amount"),
    notes: get("notes"),
  }).where(eq(onboardingRequests.id, id));

  await saveOnboardingDocAttachments(id, formData, get("ta_pic_name"));

  const returnTo = formData.get("return_to") as string;

  await logActivity("ta", "update", "Onboarding Request diperbarui", "Onboarding");
  revalidatePath("/ta/onboarding");
  if (returnTo) {
    revalidatePath(returnTo);
    await markSaved();
    redirect(returnTo);
  }
  await markSaved();
  redirect("/ta/onboarding");
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteOnboardingRequest(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("ta", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const linkedEmployee = await db.select().from(employees).where(eq(employees.onboarding_request_id, id));
  if (linkedEmployee.length > 0) {
    return { ok: false, error: "Onboarding ini sudah di-promote jadi Employee, tidak bisa dihapus." };
  }

  await db.delete(onboardingRequests).where(eq(onboardingRequests.id, id));
  await logActivity("ta", "delete", "Onboarding Request dihapus", "Onboarding");
  revalidatePath("/ta/onboarding");
  return { ok: true };
}