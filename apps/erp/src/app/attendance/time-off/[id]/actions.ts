"use server";
import { requirePilotActor } from "@/lib/actor";
import { revalidatePath } from "next/cache";
import { currentAttendanceActor } from "@/lib/require-attendance-access";
import { approveCurrentStep, rejectCurrentStep, cancelTimeOffRequest, type EngineResult } from "../lib/time-off-approval";
import { logActivity } from "@/lib/activity-log";

export async function approveTimeOffStep(requestId: string): Promise<EngineResult> {
  await requirePilotActor();

  const actor = await currentAttendanceActor();
  const result = await approveCurrentStep(actor, requestId);
  if (result.ok) {
    await logActivity("attendance", "update", `Time Off approved: ${actor.userName}`, "Time Off");
    revalidatePath(`/attendance/time-off/${requestId}`);
    revalidatePath("/attendance/time-off");
  }
  return result;
}

export async function rejectTimeOffStep(requestId: string, notes: string): Promise<EngineResult> {
  await requirePilotActor();

  const actor = await currentAttendanceActor();
  const result = await rejectCurrentStep(actor, requestId, notes);
  if (result.ok) {
    await logActivity("attendance", "update", `Time Off rejected: ${actor.userName}`, "Time Off");
    revalidatePath(`/attendance/time-off/${requestId}`);
    revalidatePath("/attendance/time-off");
  }
  return result;
}

export async function cancelTimeOffRequestAction(requestId: string): Promise<EngineResult> {
  await requirePilotActor();

  const actor = await currentAttendanceActor();
  const result = await cancelTimeOffRequest(actor, requestId);
  if (result.ok) {
    await logActivity("attendance", "update", `Time Off cancelled: ${actor.userName}`, "Time Off");
    revalidatePath(`/attendance/time-off/${requestId}`);
    revalidatePath("/attendance/time-off");
  }
  return result;
}
