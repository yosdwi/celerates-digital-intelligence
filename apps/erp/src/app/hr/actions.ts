"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { employees, employmentContracts, bpjsRegistrations, onboardingRequests } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { markSaved } from "@/lib/saved-flag";
import { logActivity } from "@/lib/activity-log";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { encryptPII } from "@/lib/pii-crypto";

export async function updateEmployee(id: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("hr");
  const employee_category_code = formData.get("employee_category_code") as string;
  const job_level_code = formData.get("job_level_code") as string;
  const position_name = formData.get("position_name") as string;
  const company_email = formData.get("company_email") as string;
  const join_date = formData.get("join_date") as string;
  const gender_code = formData.get("gender_code") as string;
  const religion_code = formData.get("religion_code") as string;
  const marital_status_changed_date = formData.get("marital_status_changed_date") as string;
  const ptkp_code = formData.get("ptkp_code") as string;
  const notes = formData.get("notes") as string;
  const ptkp_effective_year = formData.get("ptkp_effective_year") as string;

  await db.update(employees).set({
    employee_category_code: employee_category_code || null,
    job_level_code: job_level_code || null,
    position_name: position_name || null,
    company_email: company_email || null,
    join_date: join_date || null,
    gender_code: gender_code || null,
    religion_code: religion_code || null,
    marital_status_changed_date: marital_status_changed_date || null,
    ptkp_code: ptkp_code || null,
    notes,
    ptkp_effective_year: ptkp_effective_year ? Number(ptkp_effective_year) : null,
  }).where(eq(employees.id, id));

  await logActivity("hr", "update", `Employee diperbarui: ${position_name || id}`, "Employee");
  revalidatePath("/hr");
  await markSaved();
  redirect("/hr");
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteEmployee(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("hr", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const [employee] = await db.select().from(employees).where(eq(employees.id, id));
  if (!employee) return { ok: false, error: "Employee tidak ditemukan" };
  await db.delete(employmentContracts).where(eq(employmentContracts.employee_id, id));
  await db.delete(bpjsRegistrations).where(eq(bpjsRegistrations.employee_id, id));
  await db.delete(employees).where(eq(employees.id, id));
  await logActivity("hr", "delete", `Employee: ${employee?.employee_no ?? id}`, "Employee");
  revalidatePath("/hr");
  return { ok: true };
}

export async function addContract(employeeId: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("hr");
  const contract_no = formData.get("contract_no") as string;
  const document_date = formData.get("document_date") as string;
  const signed_date = formData.get("signed_date") as string;
  const start_date = formData.get("start_date") as string;
  const end_date = formData.get("end_date") as string;
  const employment_type_code = formData.get("employment_type_code") as string;
  const sk_no = formData.get("sk_no") as string;
  const sk_date = formData.get("sk_date") as string;
  const parent_contract_id = formData.get("parent_contract_id") as string;
  const addendum_seq = formData.get("addendum_seq") as string;

  await db.insert(employmentContracts).values({
    employee_id: employeeId,
    contract_no,
    document_date: document_date || null,
    signed_date: signed_date || null,
    start_date,
    end_date: end_date || null,
    employment_type_code,
    sk_no: sk_no || null,
    sk_date: sk_date || null,
    parent_contract_id: parent_contract_id || null,
    addendum_seq: addendum_seq ? Number(addendum_seq) : null,
  });

  await logActivity("hr", "create", `Kontrak baru: ${contract_no}`, "Employee");
  revalidatePath(`/hr/${employeeId}`);
}

export async function updateBpjsStatus(id: string, employeeId: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("hr");
  const company_no = formData.get("company_no") as string;
  const status_code = formData.get("status_code") as string;
  const due_month = formData.get("due_month") as string;
  const deduction_start_month = formData.get("deduction_start_month") as string;
  const registered_date = formData.get("registered_date") as string;
  const card_sent_date = formData.get("card_sent_date") as string;
  const active_month = formData.get("active_month") as string;
  const sipp_active_date = formData.get("sipp_active_date") as string;

  await db.update(bpjsRegistrations).set({
    company_no: company_no || null,
    status_code: status_code || null,
    due_month: due_month || null,
    deduction_start_month: deduction_start_month || null,
    registered_date: registered_date || null,
    card_sent_date: card_sent_date || null,
    active_month: active_month || null,
    sipp_active_date: sipp_active_date || null,
  }).where(eq(bpjsRegistrations.id, id));

  await logActivity("hr", "update", `BPJS Status diubah jadi ${status_code || "-"}`, "Employee");
  revalidatePath(`/hr/${employeeId}`);
}

/**
 * Update data pribadi employee lewat HR sendiri (bukan lewat TA onboarding lagi),
 * supaya HR nggak perlu akses divisi TA cuma buat betulkan data pribadi. Datanya
 * tetap disimpan di tabel onboardingRequests yang sama -- employee tidak punya
 * kolom data pribadi sendiri, cuma referensi onboarding_request_id.
 */
export async function updateEmployeePersonalData(employeeId: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("hr");
  const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
  if (!employee?.onboarding_request_id) throw new Error("Employee tidak punya data onboarding untuk diedit");

  const get = (name: string) => (formData.get(name) as string) || null;
  const getNum = (name: string) => {
    const v = formData.get(name) as string;
    return v ? Number(v) : null;
  };
  const getBool = (name: string) => formData.get(name) === "on";

  await db.update(onboardingRequests).set({
    nik: encryptPII(get("nik")),
    birth_place: get("birth_place"),
    birth_date: get("birth_date"),
    available_start_date: get("available_start_date"),
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
    mother_maiden_name: get("mother_maiden_name"),
    blood_type_code: get("blood_type_code"),
    ta_pic_name: formData.get("ta_pic_name") as string,
    employee_status_code: get("employee_status_code"),
    needs_laptop: getBool("needs_laptop"),
    needs_id_card: getBool("needs_id_card"),
  }).where(eq(onboardingRequests.id, employee.onboarding_request_id));

  await logActivity("hr", "update", `Data pribadi diperbarui: ${employee.employee_no}`, "Employee");
  revalidatePath(`/hr/${employeeId}`);
  revalidatePath(`/hr/${employeeId}/edit-personal`);
  await markSaved();
  redirect(`/hr/${employeeId}`);
}