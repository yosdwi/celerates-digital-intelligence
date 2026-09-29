import { db } from "@/db";
import { timeOffRequests, timeOffApprovalSteps, attendanceApprovalSteps, users } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";
import type { AttendanceActor } from "@/lib/require-attendance-access";

export type SubmitInput = {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  delegateUserId: string | null;
};

export type EngineResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Snapshot config attendanceApprovalSteps (yang di-setup HR) ke
 * timeOffApprovalSteps milik request ini -- perubahan config HR belakangan
 * TIDAK mengubah request yang sudah disubmit.
 */
export async function submitTimeOffRequest(actor: AttendanceActor, input: SubmitInput): Promise<EngineResult<{ id: string }>> {
  const chain = await db.select().from(attendanceApprovalSteps).orderBy(asc(attendanceApprovalSteps.step_order));
  if (chain.length === 0) {
    return { ok: false, error: "Approval chain belum di-setup HR. Hubungi HR untuk mengatur alur approval Time Off dulu." };
  }
  if (!input.startDate || !input.endDate) return { ok: false, error: "Tanggal mulai dan selesai wajib diisi." };
  if (new Date(input.endDate) < new Date(input.startDate)) return { ok: false, error: "Tanggal selesai tidak boleh sebelum tanggal mulai." };

  const [request] = await db.insert(timeOffRequests).values({
    user_id: actor.userId,
    leave_type_id: input.leaveTypeId,
    start_date: input.startDate,
    end_date: input.endDate,
    reason: input.reason || null,
    delegate_user_id: input.delegateUserId,
  }).returning({ id: timeOffRequests.id });

  await db.insert(timeOffApprovalSteps).values(
    chain.map((s) => ({
      request_id: request.id,
      step_order: s.step_order,
      approver_user_id: s.approver_user_id,
    }))
  );

  const firstApprover = chain[0].approver_user_id;
  await createNotification(firstApprover, "Ada Time Off request baru", `${actor.userName} mengajukan Time Off, menunggu persetujuan Anda.`, `/attendance/time-off/${request.id}`);

  return { ok: true, data: { id: request.id } };
}

/** Step paling kecil urutannya yang masih pending untuk sebuah request -- inilah "siapa yang bisa bertindak sekarang". */
async function currentPendingStep(requestId: string) {
  const [step] = await db
    .select()
    .from(timeOffApprovalSteps)
    .where(and(eq(timeOffApprovalSteps.request_id, requestId), eq(timeOffApprovalSteps.status_code, "pending")))
    .orderBy(asc(timeOffApprovalSteps.step_order))
    .limit(1);
  return step ?? null;
}

export async function approveCurrentStep(actor: AttendanceActor, requestId: string): Promise<EngineResult> {
  const [request] = await db.select().from(timeOffRequests).where(eq(timeOffRequests.id, requestId));
  if (!request) return { ok: false, error: "Request tidak ditemukan." };
  if (request.status_code !== "pending") return { ok: false, error: "Request ini sudah tidak pending." };

  const step = await currentPendingStep(requestId);
  if (!step) return { ok: false, error: "Tidak ada step yang menunggu approval." };
  if (step.approver_user_id !== actor.userId) return { ok: false, error: "Anda bukan approver untuk step ini." };

  await db.update(timeOffApprovalSteps).set({ status_code: "approved", acted_at: new Date() }).where(eq(timeOffApprovalSteps.id, step.id));

  const nextStep = await currentPendingStep(requestId);
  if (nextStep) {
    await createNotification(nextStep.approver_user_id, "Ada Time Off request menunggu Anda", `Request Time Off sudah disetujui step sebelumnya, giliran Anda approve.`, `/attendance/time-off/${requestId}`);
  } else {
    await db.update(timeOffRequests).set({ status_code: "approved" }).where(eq(timeOffRequests.id, requestId));
    await createNotification(request.user_id, "Time Off Anda disetujui", "Semua approver sudah menyetujui request Time Off Anda.", `/attendance/time-off/${requestId}`);
  }

  return { ok: true, data: undefined };
}

export async function rejectCurrentStep(actor: AttendanceActor, requestId: string, notes: string): Promise<EngineResult> {
  const [request] = await db.select().from(timeOffRequests).where(eq(timeOffRequests.id, requestId));
  if (!request) return { ok: false, error: "Request tidak ditemukan." };
  if (request.status_code !== "pending") return { ok: false, error: "Request ini sudah tidak pending." };

  const step = await currentPendingStep(requestId);
  if (!step) return { ok: false, error: "Tidak ada step yang menunggu approval." };
  if (step.approver_user_id !== actor.userId) return { ok: false, error: "Anda bukan approver untuk step ini." };

  await db.update(timeOffApprovalSteps).set({ status_code: "rejected", acted_at: new Date(), notes: notes || null }).where(eq(timeOffApprovalSteps.id, step.id));
  await db.update(timeOffRequests).set({ status_code: "rejected" }).where(eq(timeOffRequests.id, requestId));
  await createNotification(request.user_id, "Time Off Anda ditolak", notes || "Request Time Off Anda ditolak.", `/attendance/time-off/${requestId}`);

  return { ok: true, data: undefined };
}

export async function cancelTimeOffRequest(actor: AttendanceActor, requestId: string): Promise<EngineResult> {
  const [request] = await db.select().from(timeOffRequests).where(eq(timeOffRequests.id, requestId));
  if (!request) return { ok: false, error: "Request tidak ditemukan." };
  if (request.user_id !== actor.userId) return { ok: false, error: "Anda cuma bisa membatalkan request milik sendiri." };
  if (request.status_code !== "pending") return { ok: false, error: "Request ini sudah tidak bisa dibatalkan." };

  await db.update(timeOffRequests).set({ status_code: "cancelled" }).where(eq(timeOffRequests.id, requestId));
  return { ok: true, data: undefined };
}

export async function activeApproverOptions() {
  return db.select({ id: users.id, full_name: users.full_name, role_title: users.role_title }).from(users).where(eq(users.status, "active"));
}
