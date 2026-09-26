"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { extensionIncrementRequests, employmentContracts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity-log";
import { requireDivisionAccess } from "@/lib/require-division-access";

export type ProcessResult = { ok: true } | { ok: false; error: string };

/**
 * Dipanggil HR setelah request Extension & Increment sudah full-approved di TM
 * (Approval 1-3 + Acknowledge). Bikin baris kontrak Adendum baru buat employee
 * terkait, supaya muncul otomatis di riwayat kontrak / raport per nama di modul Employee.
 */
export async function processExtensionRequest(id: string): Promise<ProcessResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("hr");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const [request] = await db.select().from(extensionIncrementRequests).where(eq(extensionIncrementRequests.id, id));
  if (!request) return { ok: false, error: "Request tidak ditemukan" };
  if (request.status_code !== "approved") return { ok: false, error: "Request ini belum full approved di TM" };
  if (request.hr_status_code === "processed") return { ok: false, error: "Request ini sudah diproses sebelumnya" };

  const existingContracts = await db
    .select()
    .from(employmentContracts)
    .where(eq(employmentContracts.employee_id, request.employee_id))
    .orderBy(desc(employmentContracts.start_date));

  const latestContract = existingContracts[0];
  const addendumSeq = existingContracts.reduce((max, c) => Math.max(max, c.addendum_seq ?? 0), 0) + 1;
  const contractNo = `${latestContract?.contract_no ?? "KONTRAK"}-ADD${addendumSeq}`;
  const today = new Date().toISOString().slice(0, 10);

  const [newContract] = await db.insert(employmentContracts).values({
    employee_id: request.employee_id,
    parent_contract_id: latestContract?.id ?? null,
    contract_no: contractNo,
    addendum_seq: addendumSeq,
    document_date: today,
    start_date: request.propose_start_date ?? today,
    end_date: request.propose_end_date ?? null,
    employment_type_code: request.proposed_employment_type_code ?? latestContract?.employment_type_code ?? "pkwt",
  }).returning();

  await db.update(extensionIncrementRequests).set({
    hr_status_code: "processed",
    employment_contract_id: newContract.id,
  }).where(eq(extensionIncrementRequests.id, id));

  await logActivity("hr", "create", `Kontrak Adendum diproses: ${contractNo}`, "Extension Request");
  revalidatePath("/hr/extension-requests");
  revalidatePath(`/hr/${request.employee_id}`);
  revalidatePath("/tm/extension-requests");
  return { ok: true };
}
