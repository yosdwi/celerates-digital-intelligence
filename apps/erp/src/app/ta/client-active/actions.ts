"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity-log";
import { notifyAboutClientSubmissionUpdate } from "@/lib/client-submission";
import { CLIENT_SUBMISSION_LABELS } from "./constants";

export type UpdateClientSubmissionResult = { ok: true } | { ok: false; error: string };

export async function updateClientSubmissionStatus(applicationId: string, formData: FormData): Promise<UpdateClientSubmissionResult> {
  await requirePilotActor();

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const userName = (session?.user as any)?.fullName ?? session?.user?.name ?? "Seseorang";
  if (!userId) return { ok: false, error: "Belum login" };

  const status_code = formData.get("client_submission_status_code") as string;
  const note = (formData.get("client_submission_note") as string) || null;
  if (!status_code) return { ok: false, error: "Status wajib dipilih" };

  await db.update(applications).set({
    client_submission_status_code: status_code,
    client_submission_note: note,
    client_submission_updated_at: new Date(),
    client_submission_updated_by_name: userName,
  }).where(eq(applications.id, applicationId));

  await notifyAboutClientSubmissionUpdate(userId, userName, applicationId, status_code, note);

  await logActivity("ta", "update", `Client Active: status diubah jadi ${CLIENT_SUBMISSION_LABELS[status_code] ?? status_code}`, "Client Active");
  revalidatePath("/ta/client-active");
  revalidatePath("/ta/pipeline");
  return { ok: true };
}
