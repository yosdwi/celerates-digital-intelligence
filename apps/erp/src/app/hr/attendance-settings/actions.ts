"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { leaveTypes, attendanceApprovalSteps } from "@/db/schema";
import { eq, asc, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { logActivity } from "@/lib/activity-log";

export type ActionResult = { ok: true } | { ok: false; error: string };

// ---------- Leave Types ----------

export async function createLeaveType(formData: FormData): Promise<void> {
  await requirePilotActor();

  await requireDivisionAccess("hr", "full");
  const name = (formData.get("name") as string)?.trim();
  const requiresFile = formData.get("requires_file") === "on";
  if (!name) throw new Error("Nama jenis Time Off wajib diisi.");

  await db.insert(leaveTypes).values({ name, requires_file: requiresFile });
  await logActivity("hr", "create", `Leave Type: ${name}`, "Attendance Settings");
  revalidatePath("/hr/attendance-settings");
}

export async function toggleLeaveTypeActive(id: string, isActive: boolean): Promise<ActionResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("hr", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  await db.update(leaveTypes).set({ is_active: isActive }).where(eq(leaveTypes.id, id));
  revalidatePath("/hr/attendance-settings");
  return { ok: true };
}

export async function deleteLeaveType(id: string): Promise<ActionResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("hr", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  await db.delete(leaveTypes).where(eq(leaveTypes.id, id));
  await logActivity("hr", "delete", "Leave Type dihapus", "Attendance Settings");
  revalidatePath("/hr/attendance-settings");
  return { ok: true };
}

// ---------- Approval Chain ----------

export async function addApprovalStep(formData: FormData): Promise<void> {
  await requirePilotActor();

  await requireDivisionAccess("hr", "full");
  const approverUserId = formData.get("approver_user_id") as string;
  if (!approverUserId) throw new Error("Approver wajib dipilih.");

  const [row] = await db.select({ maxOrder: max(attendanceApprovalSteps.step_order) }).from(attendanceApprovalSteps);
  const nextOrder = (row?.maxOrder ?? 0) + 1;

  await db.insert(attendanceApprovalSteps).values({ step_order: nextOrder, approver_user_id: approverUserId });
  await logActivity("hr", "create", `Approval chain step ${nextOrder} ditambahkan`, "Attendance Settings");
  revalidatePath("/hr/attendance-settings");
}

export async function removeApprovalStep(id: string): Promise<ActionResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("hr", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  await db.delete(attendanceApprovalSteps).where(eq(attendanceApprovalSteps.id, id));
  await logActivity("hr", "delete", "Approval chain step dihapus", "Attendance Settings");
  revalidatePath("/hr/attendance-settings");
  return { ok: true };
}

/** Tukar step_order dengan step tetangganya (naik/turun urutan). */
export async function moveApprovalStep(id: string, direction: "up" | "down"): Promise<ActionResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("hr", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }

  const steps = await db.select().from(attendanceApprovalSteps).orderBy(asc(attendanceApprovalSteps.step_order));
  const idx = steps.findIndex((s) => s.id === id);
  if (idx === -1) return { ok: false, error: "Step tidak ditemukan." };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= steps.length) return { ok: false, error: "Tidak bisa dipindah." };

  const a = steps[idx];
  const b = steps[swapIdx];
  // Hindari bentrok unique constraint step_order pas swap: lewat nilai sementara dulu.
  await db.update(attendanceApprovalSteps).set({ step_order: -1 }).where(eq(attendanceApprovalSteps.id, a.id));
  await db.update(attendanceApprovalSteps).set({ step_order: a.step_order }).where(eq(attendanceApprovalSteps.id, b.id));
  await db.update(attendanceApprovalSteps).set({ step_order: b.step_order }).where(eq(attendanceApprovalSteps.id, a.id));

  revalidatePath("/hr/attendance-settings");
  return { ok: true };
}
