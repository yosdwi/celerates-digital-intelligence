"use server";
import { requirePilotActor } from "@/lib/actor";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentAttendanceActor } from "@/lib/require-attendance-access";
import { saveAttachmentsAndLinks, extractFiles } from "@/lib/attachments";
import { logActivity } from "@/lib/activity-log";
import { TIME_OFF_REQUEST_SOURCE } from "../../constants";
import { submitTimeOffRequest } from "../lib/time-off-approval";

export async function createTimeOffRequest(formData: FormData): Promise<void> {
  await requirePilotActor();

  const actor = await currentAttendanceActor();

  const leaveTypeId = formData.get("leave_type_id") as string;
  const startDate = formData.get("start_date") as string;
  const endDate = formData.get("end_date") as string;
  const reason = (formData.get("reason") as string)?.trim() ?? "";
  const delegateUserId = (formData.get("delegate_user_id") as string) || null;

  if (!leaveTypeId) throw new Error("Jenis Time Off wajib dipilih.");

  const result = await submitTimeOffRequest(actor, { leaveTypeId, startDate, endDate, reason, delegateUserId });
  if (!result.ok) throw new Error(result.error);

  const files = extractFiles(formData, "attachment");
  if (files.length > 0) {
    await saveAttachmentsAndLinks(TIME_OFF_REQUEST_SOURCE, result.data.id, { files, links: [] }, actor.userName);
  }

  await logActivity("attendance", "create", `Time Off request: ${actor.userName}`, "Time Off");
  revalidatePath("/attendance/time-off");
  redirect(`/attendance/time-off/${result.data.id}`);
}
