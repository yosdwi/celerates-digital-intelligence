import { db } from "@/db";
import { opportunities, employees, signatureRequests, candidates, onboardingRequests, talentAssignments, projectContracts, employmentContracts, requisitions } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { notifyDivision } from "@/lib/notifications";
import { PQ_SIGNATURE_SOURCE } from "@/app/sales/pq-constants";

export async function isPqSigned(opportunityId: string): Promise<boolean> {
  const [sig] = await db.select().from(signatureRequests)
    .where(and(
      eq(signatureRequests.source_type, PQ_SIGNATURE_SOURCE),
      eq(signatureRequests.source_id, opportunityId),
      eq(signatureRequests.status_code, "signed")
    ));
  return !!sig;
}

async function getEmployeeForOpportunity(opportunityId: string) {
  const [opty] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
  if (!opty?.onboarding_request_id) return null;
  const [employee] = await db.select().from(employees).where(eq(employees.onboarding_request_id, opty.onboarding_request_id));
  return employee ?? null;
}

async function getOpportunityForOnboarding(onboardingRequestId: string) {
  const [opty] = await db.select().from(opportunities).where(eq(opportunities.onboarding_request_id, onboardingRequestId));
  return opty ?? null;
}

/**
 * Kirim notifikasi ke divisi TM & PMO kalau PQ opportunity ini sudah TTD DAN
 * talent-nya sudah di-promote jadi Employee. Aman dipanggil berkali-kali dari
 * dua titik trigger berbeda (signRequest & promoteToEmployee) -- pemanggil
 * WAJIB sudah mengecek kondisi lain terpenuhi sebelum manggil ini, supaya
 * notifikasi hanya terkirim sekali (dari event yang menyelesaikan syarat kedua).
 */
async function notifyReadyForSetup(opportunityId: string) {
  const [opty] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
  if (!opty) return;

  let candidateName = "-";
  if (opty.onboarding_request_id) {
    const [onboarding] = await db.select().from(onboardingRequests).where(eq(onboardingRequests.id, opty.onboarding_request_id));
    if (onboarding?.candidate_id) {
      const [candidate] = await db.select({ candidate_name: candidates.candidate_name }).from(candidates).where(eq(candidates.id, onboarding.candidate_id));
      candidateName = candidate?.candidate_name ?? "-";
    }
  }

  const body = `Opty No: ${opty.opty_no} | Candidate: ${candidateName} | Client: ${opty.client_name} | Position: ${opty.position_name}. PQ sudah TTD dan talent sudah onboard -- silakan tindaklanjuti.`;

  await notifyDivision("tm", "Talent Siap Di-setup ke Talents Book", body, "/tm");
  await notifyDivision("pmo", "Project Siap Di-setup ke A.Contract", body, "/pmo/contracts");
}

/** Dipanggil setelah signature_request PQ berhasil ditandatangani (dari ttd-online). */
export async function onPqSigned(opportunityId: string) {
  // Approval Date PQ Tracker disamakan dengan tanggal TTD signed -- sebelumnya
  // field ini manual, sekarang selalu ikut kapan PQ beneran ditandatangani.
  await db.update(opportunities)
    .set({ approval_date: new Date().toISOString().slice(0, 10) })
    .where(eq(opportunities.id, opportunityId));

  const employee = await getEmployeeForOpportunity(opportunityId);
  if (!employee) return;
  await notifyReadyForSetup(opportunityId);
}

/** Dipanggil setelah talent di-promote jadi Employee (dari onboarding). */
export async function onTalentPromoted(onboardingRequestId: string) {
  const opty = await getOpportunityForOnboarding(onboardingRequestId);
  if (!opty) return;
  const signed = await isPqSigned(opty.id);
  if (!signed) return;
  await notifyReadyForSetup(opty.id);
}

export type PendingTalentSetup = {
  employeeId: string;
  employeeNo: string;
  candidateName: string | null;
  clientName: string | null;
  positionName: string | null;
  opportunityId: string | null;
  optyNo: string | null;
  requisitionId: string | null;
  priceAmount: number | null;
  startDate: string | null;
  endDate: string | null;
};

/**
 * List SEMUA employee yang sudah di-promote tapi belum ada Talent Assignment
 * yang lengkap (buat section "Perlu Ditindaklanjuti" di TM).
 *
 * Sebelumnya di-gate di belakang "PQ sudah TTD" + "sudah di-convert ke PQ
 * Tracker" -- dua syarat itu independen dari proses HR/promote, jadi talent
 * yang PQ-nya belum TTD atau requisition-nya nggak pernah lewat Sales (nggak
 * ada opportunity ter-link) nggak akan PERNAH muncul di sini sama sekali,
 * padahal mereka jelas "belum di-setup TM". Sekarang basisnya langsung dari
 * tabel `employees` (siapa pun yang sudah dipromosikan), dan info Client/
 * Position/ID Opty/PQ dari Sales/TA ditampilkan kalau memang ada linknya --
 * kalau belum ada, tetap tampil dengan info itu kosong ("-") daripada
 * disembunyikan seluruhnya.
 */
export async function getPendingTalentSetups(): Promise<PendingTalentSetup[]> {
  const rows = await db
    .select({
      employeeId: employees.id,
      employeeNo: employees.employee_no,
      joinDate: employees.join_date,
      candidateName: candidates.candidate_name,
      requisitionId: onboardingRequests.requisition_id,
      reqClientName: requisitions.client_name,
      reqPositionName: requisitions.position_name,
      optyId: opportunities.id,
      optyNo: opportunities.opty_no,
      optyClientName: opportunities.client_name,
      optyPositionName: opportunities.position_name,
      optyPriceAmount: opportunities.price_amount,
      assignmentId: talentAssignments.id,
      assignmentStatusCode: talentAssignments.status_code,
    })
    .from(employees)
    .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .leftJoin(requisitions, eq(onboardingRequests.requisition_id, requisitions.id))
    .leftJoin(opportunities, eq(opportunities.onboarding_request_id, employees.onboarding_request_id))
    .leftJoin(talentAssignments, eq(talentAssignments.employee_id, employees.id));

  const results: PendingTalentSetup[] = [];
  for (const r of rows) {
    if (r.assignmentId && r.assignmentStatusCode) continue; // udah lengkap di-setup TM

    const [latestContract] = await db.select({ end_date: employmentContracts.end_date })
      .from(employmentContracts)
      .where(eq(employmentContracts.employee_id, r.employeeId))
      .orderBy(desc(employmentContracts.start_date))
      .limit(1);

    results.push({
      employeeId: r.employeeId,
      employeeNo: r.employeeNo,
      candidateName: r.candidateName,
      clientName: r.optyClientName ?? r.reqClientName ?? null,
      positionName: r.optyPositionName ?? r.reqPositionName ?? null,
      opportunityId: r.optyId ?? null,
      optyNo: r.optyNo ?? null,
      requisitionId: r.requisitionId ?? null,
      priceAmount: r.optyPriceAmount ?? null,
      startDate: r.joinDate,
      endDate: latestContract?.end_date ?? null,
    });
  }

  return results;
}

export type PendingContractSetup = {
  opportunityId: string;
  optyNo: string;
  clientName: string;
  positionName: string | null;
  candidateName: string | null;
  priceAmount: number | null;
  startDate: string | null;
  endDate: string | null;
  /** "onboarding": sudah lewat proses TM (PQ signed + talent onboard). "won_direct": langsung dari Sales (pipeline Won), TM belum tentu proses -- ditandai beda di UI PMO supaya jelas asalnya. */
  source: "onboarding" | "won_direct";
};

/**
 * List opportunity yang perlu ditindaklanjuti PMO ke A.Contract (belum ada
 * project_contracts). Dua jalur independen, TIDAK saling menunggu:
 * 1. "onboarding" -- PQ sudah TTD & talent sudah onboard (proses TM selesai).
 * 2. "won_direct" -- pipeline Sales sudah ditandai Win, TIDAK peduli proses TM
 *    sudah jalan atau belum. PMO bisa langsung bikin kontrak dari sini; TM
 *    dapet notifikasi terpisah (lihat updatePipelineStage di sales/actions.ts)
 *    buat proses talent assignment mereka sendiri secara paralel.
 */
export async function getPendingContractSetups(): Promise<PendingContractSetup[]> {
  const allOpties = await db.select().from(opportunities);
  const results: PendingContractSetup[] = [];

  for (const opty of allOpties) {
    const [existingContract] = await db.select().from(projectContracts).where(eq(projectContracts.opportunity_id, opty.id));
    if (existingContract) continue;

    if (opty.onboarding_request_id) {
      const signed = await isPqSigned(opty.id);
      const [employee] = signed
        ? await db.select().from(employees).where(eq(employees.onboarding_request_id, opty.onboarding_request_id))
        : [undefined];

      if (signed && employee) {
        const [onboarding] = await db.select().from(onboardingRequests).where(eq(onboardingRequests.id, opty.onboarding_request_id));
        let candidateName: string | null = null;
        if (onboarding?.candidate_id) {
          const [candidate] = await db.select({ candidate_name: candidates.candidate_name }).from(candidates).where(eq(candidates.id, onboarding.candidate_id));
          candidateName = candidate?.candidate_name ?? null;
        }

        // Start/End Date diambil dari data talent (join date employee & kontrak
        // employment terbaru) -- lebih akurat daripada opportunities.start_date/end_date
        // di jalur ini karena talent-nya sudah benar-benar onboard.
        const [latestContract] = await db.select({ end_date: employmentContracts.end_date })
          .from(employmentContracts)
          .where(eq(employmentContracts.employee_id, employee.id))
          .orderBy(desc(employmentContracts.start_date))
          .limit(1);

        results.push({
          opportunityId: opty.id,
          optyNo: opty.opty_no,
          clientName: opty.client_name,
          positionName: opty.position_name,
          candidateName,
          priceAmount: opty.price_amount,
          startDate: employee.join_date,
          endDate: latestContract?.end_date ?? null,
          source: "onboarding",
        });
        continue;
      }
    }

    // Jalur langsung dari Sales -- tidak butuh onboarding/employee sama sekali.
    if (opty.pipeline_stage_code === "win") {
      results.push({
        opportunityId: opty.id,
        optyNo: opty.opty_no,
        clientName: opty.client_name,
        positionName: opty.position_name,
        candidateName: null,
        priceAmount: opty.price_amount,
        startDate: opty.start_date,
        endDate: opty.end_date,
        source: "won_direct",
      });
    }
  }

  return results;
}
