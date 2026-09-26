"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { talentAssignments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { logActivity } from "@/lib/activity-log";

export type ApplyCogsInput = {
  talentAssignmentId: string;
  priceAmount: number;
  basicSalaryAmount: number;
  functionalAllowanceAmount: number;
  transportAllowanceAmount: number;
  projectAllowanceAmount: number;
  accommodationAllowanceAmount: number;
  fieldAllowanceAmount: number;
  overtimeAllowanceAmount: number;
  taxBrutoAmount: number;
  grossSalaryAmount: number;
  takeHomePayAmount: number;
  kompensasiAmount: number;
  thrAllowanceAmount: number;
  annualBonusAllowanceAmount: number;
  annualMedicalReimbursementAmount: number;
  laptopOwnershipAmount: number;
  trainingAmount: number;
  refreshmentAmount: number;
  bpjsKesehatanCompanyAmount: number;
  jkkAmount: number;
  jkmAmount: number;
  jhtCompanyAmount: number;
  jkpAmount: number;
  jpCompanyAmount: number;
  bpjsKesehatanEmployeeAmount: number;
  jhtEmployeeAmount: number;
  jpEmployeeAmount: number;
  managementFeeAmount: number;
  totalCogsAmount: number;
};

export type ApplyCogsResult = { ok: true } | { ok: false; error: string };

/**
 * Nulis hasil hitungan COGS Calculator balik ke Talents Book -- dipanggil dari
 * tombol "Terapkan ke Talents Book" di calculator-form.tsx. Menggantikan
 * input manual salary/tax/BPJS yang dulu ada di form Edit Talent Assignment
 * (sekarang cuma read-only di sana, lihat src/app/tm/[id]/edit/page.tsx).
 */
export async function applyCogsToTalentAssignment(input: ApplyCogsInput): Promise<ApplyCogsResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("tm");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }

  const { talentAssignmentId } = input;
  if (!talentAssignmentId) return { ok: false, error: "Talent belum dipilih" };

  await db.update(talentAssignments).set({
    price_amount: Math.round(input.priceAmount),
    basic_salary_amount: Math.round(input.basicSalaryAmount),
    functional_allowance_amount: Math.round(input.functionalAllowanceAmount),
    transport_allowance_amount: Math.round(input.transportAllowanceAmount),
    project_allowance_amount: Math.round(input.projectAllowanceAmount),
    accommodation_allowance_amount: Math.round(input.accommodationAllowanceAmount),
    field_allowance_amount: Math.round(input.fieldAllowanceAmount),
    overtime_allowance_amount: Math.round(input.overtimeAllowanceAmount),
    tax_bruto_amount: Math.round(input.taxBrutoAmount),
    gross_salary_amount: Math.round(input.grossSalaryAmount),
    take_home_pay_amount: Math.round(input.takeHomePayAmount),
    kompensasi_amount: Math.round(input.kompensasiAmount),
    thr_allowance_amount: Math.round(input.thrAllowanceAmount),
    annual_bonus_allowance_amount: Math.round(input.annualBonusAllowanceAmount),
    annual_medical_reimbursement_amount: Math.round(input.annualMedicalReimbursementAmount),
    laptop_ownership_amount: Math.round(input.laptopOwnershipAmount),
    training_amount: Math.round(input.trainingAmount),
    refreshment_amount: Math.round(input.refreshmentAmount),
    bpjs_kesehatan_company_amount: Math.round(input.bpjsKesehatanCompanyAmount),
    jkk_amount: Math.round(input.jkkAmount),
    jkm_amount: Math.round(input.jkmAmount),
    jht_company_amount: Math.round(input.jhtCompanyAmount),
    jkp_amount: Math.round(input.jkpAmount),
    jp_company_amount: Math.round(input.jpCompanyAmount),
    bpjs_kesehatan_employee_amount: Math.round(input.bpjsKesehatanEmployeeAmount),
    jht_employee_amount: Math.round(input.jhtEmployeeAmount),
    jp_employee_amount: Math.round(input.jpEmployeeAmount),
    management_fee_amount: Math.round(input.managementFeeAmount),
    total_cogs_amount: Math.round(input.totalCogsAmount),
  }).where(eq(talentAssignments.id, talentAssignmentId));

  await logActivity("tm", "update", "Hasil COGS Calculator diterapkan ke Talents Book", "Talents Book");
  revalidatePath("/tm");
  revalidatePath(`/tm/${talentAssignmentId}/edit`);

  return { ok: true };
}
