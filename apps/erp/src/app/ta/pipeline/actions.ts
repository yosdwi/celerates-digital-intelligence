"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { uploadDocument } from "@/lib/storage";
import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { markSaved } from "@/lib/saved-flag";
import { logActivity } from "@/lib/activity-log";
import { saveAttachmentsAndLinks, extractFiles, extractLinks, deleteAttachment } from "@/lib/attachments";
import { APPLICATION_CV_CELERATES_SOURCE } from "./constants";
import { requireDivisionAccess } from "@/lib/require-division-access";

export async function createApplication(formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("ta");
  const application_date = formData.get("application_date") as string;
  const requisition_id = formData.get("requisition_id") as string;
  const candidate_id = formData.get("candidate_id") as string;
  const level_code = formData.get("level_code") as string;
  const ta_pic_name = formData.get("ta_pic_name") as string;
  const cv_asli_url = formData.get("cv_asli_url") as string;
  const cv_celerates_url_text = formData.get("cv_celerates_url") as string;
  const cv_celerates_file = formData.get("cv_celerates_file") as File | null;
  const candidate_source_code = formData.get("candidate_source_code") as string;
  const price_amount = formData.get("price_amount") as string;
  const notes = formData.get("notes") as string;

  const id = randomUUID();

  let cv_celerates_url: string | null = null;
  if (cv_celerates_file && cv_celerates_file.size > 0) {
    cv_celerates_url = await uploadDocument(cv_celerates_file, id, "cv_celerates");
  } else if (cv_celerates_url_text) {
    cv_celerates_url = cv_celerates_url_text;
  }

  await db.insert(applications).values({
    id,
    application_date: application_date || undefined,
    requisition_id: requisition_id || null,
    candidate_id: candidate_id || null,
    level_code: level_code || null,
    ta_pic_name,
    cv_asli_url: cv_asli_url || null,
    cv_celerates_url,
    candidate_source_code: candidate_source_code || null,
    price_amount: price_amount ? Number(price_amount) : null,
    notes,
    hiring_status_code: "cv_sent",
  });

  const newFiles = extractFiles(formData, "cv_celerates_attachments");
  const newLinks = extractLinks(formData, "cv_celerates_attachments_links");
  if (newFiles.length > 0 || newLinks.length > 0) {
    await saveAttachmentsAndLinks(APPLICATION_CV_CELERATES_SOURCE, id, { files: newFiles, links: newLinks }, ta_pic_name);
  }

  await logActivity("ta", "create", `Application baru untuk TA PIC ${ta_pic_name}`, "Hiring Pipeline");
  revalidatePath("/ta/pipeline");
}

export async function deleteApplicationAttachment(attachmentId: string) {
  await requirePilotActor();

  await requireDivisionAccess("ta");
  await deleteAttachment(attachmentId);
  await logActivity("ta", "delete", "Lampiran CV Celerates dihapus", "Hiring Pipeline");
  revalidatePath("/ta/pipeline");
}

export async function updateHiringStatus(id: string, hiring_status_code: string) {
  await requirePilotActor();

  await requireDivisionAccess("ta");
  await db.update(applications).set({ hiring_status_code }).where(eq(applications.id, id));
  await logActivity("ta", "update", `Hiring Status diubah jadi ${hiring_status_code}`, "Hiring Pipeline");
  revalidatePath("/ta/pipeline");
}

export async function updateApplication(id: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("ta");
  const application_date = formData.get("application_date") as string;
  const requisition_id = formData.get("requisition_id") as string;
  const candidate_id = formData.get("candidate_id") as string;
  const level_code = formData.get("level_code") as string;
  const ta_pic_name = formData.get("ta_pic_name") as string;
  const cv_asli_url = formData.get("cv_asli_url") as string;
  const cv_celerates_url_text = formData.get("cv_celerates_url") as string;
  const cv_celerates_file = formData.get("cv_celerates_file") as File | null;
  const candidate_source_code = formData.get("candidate_source_code") as string;
  const price_amount = formData.get("price_amount") as string;
  const notes = formData.get("notes") as string;

  let cv_celerates_url: string | undefined = undefined;
  if (cv_celerates_file && cv_celerates_file.size > 0) {
    cv_celerates_url = await uploadDocument(cv_celerates_file, id, "cv_celerates");
  } else if (cv_celerates_url_text) {
    cv_celerates_url = cv_celerates_url_text;
  }

  await db.update(applications).set({
    application_date: application_date || undefined,
    requisition_id: requisition_id || null,
    candidate_id: candidate_id || null,
    level_code: level_code || null,
    ta_pic_name,
    cv_asli_url: cv_asli_url || null,
    ...(cv_celerates_url !== undefined ? { cv_celerates_url } : {}),
    candidate_source_code: candidate_source_code || null,
    price_amount: price_amount ? Number(price_amount) : null,
    notes,
  }).where(eq(applications.id, id));

  const newFiles = extractFiles(formData, "cv_celerates_attachments");
  const newLinks = extractLinks(formData, "cv_celerates_attachments_links");
  if (newFiles.length > 0 || newLinks.length > 0) {
    await saveAttachmentsAndLinks(APPLICATION_CV_CELERATES_SOURCE, id, { files: newFiles, links: newLinks }, ta_pic_name);
  }

  await logActivity("ta", "update", `Application untuk TA PIC ${ta_pic_name}`, "Hiring Pipeline");
  revalidatePath("/ta/pipeline");
  await markSaved();
  redirect("/ta/pipeline");
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteApplication(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("ta", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  await db.delete(applications).where(eq(applications.id, id));
  await logActivity("ta", "delete", "Application dihapus", "Hiring Pipeline");
  revalidatePath("/ta/pipeline");
  return { ok: true };
}