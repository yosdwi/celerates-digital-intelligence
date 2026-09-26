"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import {
  profitabilityEntries,
  talentAssignments,
  employees,
  onboardingRequests,
  candidates,
  requisitions,
  opportunities,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { calculateCogs, COGS_DEFAULTS } from "@/lib/cogs-calculator";

export type SyncResult = { ok: true; data: { synced: number; skipped: number } } | { ok: false; error: string };

/**
 * "Sync dari Talents Book" -- upsert 1 baris profitability_entries per
 * talent_assignment untuk periode (year, month) yang dipilih, dari data
 * TERKINI di talent_assignments/COGS Calculator. Mencakup SEMUA talent
 * (status apa pun -- on_project maupun yang sudah pernah tapi sekarang idle/
 * out/dst), bukan cuma yang lagi aktif, sesuai permintaan "masukin semua
 * informasi yang sudah ada, historical dan current".
 *
 * Catatan approksimasi (didokumentasikan, bukan disembunyikan): COGS dihitung
 * ulang lewat calculateCogs() dari komponen yang TERSIMPAN di talent_assignments
 * (basic salary, allowance, BPJS company, other component) + PTKP dari data
 * employee, pakai RATE DEFAULT (COGS_DEFAULTS) karena rate override asli yang
 * dipakai saat kalkulasi pertama tidak disimpan per-assignment. Kalau BPJS/rate
 * di-override manual di COGS Calculator, angka di sini bisa sedikit beda dari
 * hasil kalkulator aslinya -- dianggap cukup akurat untuk tracking bisnis.
 */
export async function syncProfitabilityFromTalents(year: number, month: number): Promise<SyncResult> {
  await requirePilotActor();

  const session = await getServerSession(authOptions);
  const actorName = (session?.user as any)?.fullName ?? session?.user?.name ?? session?.user?.email;
  if (!actorName) return { ok: false, error: "Sesi tidak valid, silakan login ulang" };

  const rows = await db
    .select({
      id: talentAssignments.id,
      employee_id: talentAssignments.employee_id,
      requisition_id: talentAssignments.requisition_id,
      pq_tracker_id: talentAssignments.pq_tracker_id,
      price_amount: talentAssignments.price_amount,
      basic_salary_amount: talentAssignments.basic_salary_amount,
      functional_allowance_amount: talentAssignments.functional_allowance_amount,
      transport_allowance_amount: talentAssignments.transport_allowance_amount,
      project_allowance_amount: talentAssignments.project_allowance_amount,
      accommodation_allowance_amount: talentAssignments.accommodation_allowance_amount,
      field_allowance_amount: talentAssignments.field_allowance_amount,
      overtime_allowance_amount: talentAssignments.overtime_allowance_amount,
      kompensasi_amount: talentAssignments.kompensasi_amount,
      thr_allowance_amount: talentAssignments.thr_allowance_amount,
      annual_bonus_allowance_amount: talentAssignments.annual_bonus_allowance_amount,
      annual_medical_reimbursement_amount: talentAssignments.annual_medical_reimbursement_amount,
      laptop_ownership_amount: talentAssignments.laptop_ownership_amount,
      training_amount: talentAssignments.training_amount,
      refreshment_amount: talentAssignments.refreshment_amount,
      bpjs_kesehatan_company_amount: talentAssignments.bpjs_kesehatan_company_amount,
      jkk_amount: talentAssignments.jkk_amount,
      jkm_amount: talentAssignments.jkm_amount,
      jht_company_amount: talentAssignments.jht_company_amount,
      jkp_amount: talentAssignments.jkp_amount,
      jp_company_amount: talentAssignments.jp_company_amount,
      ptkp_code: employees.ptkp_code,
      candidate_name: candidates.candidate_name,
      employee_no: employees.employee_no,
      req_client_name: requisitions.client_name,
      req_position_name: requisitions.position_name,
      opty_client_name: opportunities.client_name,
      opty_position_name: opportunities.position_name,
    })
    .from(talentAssignments)
    .innerJoin(employees, eq(talentAssignments.employee_id, employees.id))
    .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .leftJoin(requisitions, eq(talentAssignments.requisition_id, requisitions.id))
    .leftJoin(opportunities, eq(talentAssignments.pq_tracker_id, opportunities.id));

  let synced = 0;
  let skipped = 0;

  for (const r of rows) {
    // Talent tanpa data COGS sama sekali (belum pernah dihitung di COGS Calculator) dilewati -- nggak ada apa pun buat dihitung.
    if (!r.basic_salary_amount) { skipped++; continue; }

    const clientName = r.req_client_name ?? r.opty_client_name;
    const role = r.req_position_name ?? r.opty_position_name ?? null;
    if (!clientName) { skipped++; continue; }

    const cogs = calculateCogs({
      ptkpCode: r.ptkp_code ?? "tk0",
      price: r.price_amount ?? 0,
      basicSalary: r.basic_salary_amount ?? 0,
      functionalAllowance: r.functional_allowance_amount ?? 0,
      transportAllowance: r.transport_allowance_amount ?? 0,
      projectAllowance: r.project_allowance_amount ?? 0,
      accommodationAllowance: r.accommodation_allowance_amount ?? 0,
      fieldAllowance: r.field_allowance_amount ?? 0,
      overtimeAllowance: r.overtime_allowance_amount ?? 0,
      komisiSales: 0,
      makanMalam: 0,
      kompensasiShiftMalam: 0,
      seragam: 0,
      mcu: 0,
      lainnya: 0,
      kompensasi: r.kompensasi_amount ?? 0,
      thrAllocation: r.thr_allowance_amount ?? 0,
      annualBonusAllocation: r.annual_bonus_allowance_amount ?? 0,
      annualMedicalReimbursement: r.annual_medical_reimbursement_amount ?? 0,
      laptopOwnership: r.laptop_ownership_amount ?? 0,
      training: r.training_amount ?? 0,
      refreshment: r.refreshment_amount ?? 0,
      bpjsKesehatanCompanyRate: COGS_DEFAULTS.bpjsKesehatanCompanyRate,
      bpjsKesehatanCompanyCap: COGS_DEFAULTS.bpjsKesehatanCompanyCap,
      jkkRate: COGS_DEFAULTS.jkkRate,
      jkmRate: COGS_DEFAULTS.jkmRate,
      jhtCompanyRate: COGS_DEFAULTS.jhtCompanyRate,
      jkpRate: COGS_DEFAULTS.jkpRate,
      jpCompanyRate: COGS_DEFAULTS.jpCompanyRate,
      jpCompanyCap: COGS_DEFAULTS.jpCompanyCap,
      bpjsKesehatanEmployeeRate: COGS_DEFAULTS.bpjsKesehatanEmployeeRate,
      jhtEmployeeRate: COGS_DEFAULTS.jhtEmployeeRate,
      jpEmployeeRate: COGS_DEFAULTS.jpEmployeeRate,
      overheadRate: COGS_DEFAULTS.overheadRate,
    });

    const talentName = r.candidate_name ?? r.employee_no ?? "Talent";
    const priceAmount = r.price_amount ?? 0;
    const cogsAmount = Math.round(cogs.totalCogs);
    const marginAmount = Math.round(priceAmount - cogsAmount);
    const marginPercent = priceAmount ? (marginAmount / priceAmount) * 100 : 0;

    const values = {
      talent_assignment_id: r.id,
      employee_id: r.employee_id,
      talent_name: talentName,
      client_name: clientName,
      role,
      period_year: year,
      period_month: month,
      price_amount: priceAmount,
      cogs_amount: cogsAmount,
      margin_amount: marginAmount,
      margin_percent: marginPercent,
      generated_by_name: actorName,
      updated_at: new Date(),
    };

    await db
      .insert(profitabilityEntries)
      .values(values)
      .onConflictDoUpdate({
        target: [profitabilityEntries.talent_assignment_id, profitabilityEntries.period_year, profitabilityEntries.period_month],
        set: values,
      });

    synced++;
  }

  await logActivity("sales", "create", `Sync Profitability Tracker: ${synced} talent (periode ${month}/${year})`, "Profitability Tracker");
  revalidatePath("/sales/profitability-tracker");
  return { ok: true, data: { synced, skipped } };
}
