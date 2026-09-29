"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { candidates } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { uploadDocument } from "@/lib/storage";
import { randomUUID } from "crypto";
import { applications, onboardingRequests } from "@/db/schema";
import { redirect } from "next/navigation";
import { markSaved } from "@/lib/saved-flag";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity-log";
import { saveAttachmentsAndLinks, extractFiles, extractLinks, deleteAttachment } from "@/lib/attachments";
import { CANDIDATE_CV_ASLI_SOURCE } from "./constants";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { generateCandidateNo } from "@/lib/id-generators";

export async function createCandidate(formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("ta");
  const candidate_date = formData.get("candidate_date") as string;
  const candidate_name = formData.get("candidate_name") as string;
  const position_name = formData.get("position_name") as string;
  const level_code = formData.get("level_code") as string;
  const wa_number = formData.get("wa_number") as string;
  const email = (formData.get("email") as string)?.trim().toLowerCase() || "";
  const current_salary_amount = formData.get("current_salary_amount") as string;
  const expected_salary_amount = formData.get("expected_salary_amount") as string;
  const ta_pic_name = formData.get("ta_pic_name") as string;
  const cv_asli_url_text = formData.get("cv_asli_url") as string;
  const cv_asli_file = formData.get("cv_asli_file") as File | null;
  const candidate_source_code = formData.get("candidate_source_code") as string;
  const notes = formData.get("notes") as string;
  const candidate_open_status_code = formData.get("candidate_open_status_code") as string;
  const cv_summary = formData.get("cv_summary") as string;

  const id = randomUUID();

  // Upload & validasi semua file (CV utama + lampiran) dulu SEBELUM insert ke
  // DB. Kalau salah satu format file ditolak (bukan pdf/jpg/png/dll),
  // uploadDocument() throw di sini -- baris candidate belum sempat kesimpan,
  // jadi retry dengan format yang benar nggak bikin data double/duplicate.
  let cv_asli_url: string | null = null;
  if (cv_asli_file && cv_asli_file.size > 0) {
    cv_asli_url = await uploadDocument(cv_asli_file, id, "cv_asli");
  } else if (cv_asli_url_text) {
    cv_asli_url = cv_asli_url_text;
  }

  const newFiles = extractFiles(formData, "cv_attachments");
  const newLinks = extractLinks(formData, "cv_attachments_links");
  if (newFiles.length > 0 || newLinks.length > 0) {
    await saveAttachmentsAndLinks(CANDIDATE_CV_ASLI_SOURCE, id, { files: newFiles, links: newLinks }, ta_pic_name);
  }

  await db.insert(candidates).values({
    id,
    candidate_no: await generateCandidateNo(candidate_name),
    candidate_date: candidate_date || undefined,
    candidate_name,
    position_name: position_name || null,
    level_code: level_code || null,
    wa_number: wa_number || null,
    email: email || null,
    current_salary_amount: current_salary_amount ? Number(current_salary_amount) : null,
    expected_salary_amount: expected_salary_amount ? Number(expected_salary_amount) : null,
    ta_pic_name,
    cv_asli_url,
    candidate_source_code: candidate_source_code || null,
    notes,
    candidate_open_status_code: candidate_open_status_code || null,
    cv_summary: cv_summary || null,
  });

  await logActivity("ta", "create", `Candidate: ${candidate_name}`, "Candidate");
  revalidatePath("/ta/candidates");
  // Halaman lain (Hiring Pipeline, Onboarding) juga nge-fetch daftar candidate
  // buat dropdown picker-nya -- tanpa ini datanya stale, candidate baru
  // kelihatannya "hilang"/nggak masuk sampai cache-nya expired sendiri.
  revalidatePath("/ta/pipeline");
  revalidatePath("/ta/onboarding");
}

export async function deleteCandidateAttachment(attachmentId: string) {
  await requirePilotActor();

  await requireDivisionAccess("ta");
  await deleteAttachment(attachmentId);
  await logActivity("ta", "delete", "Lampiran CV dihapus", "Candidate");
  revalidatePath("/ta/candidates");
  revalidatePath("/ta/pipeline");
}

export async function updateCandidate(id: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("ta");
  const candidate_date = formData.get("candidate_date") as string;
  const candidate_name = formData.get("candidate_name") as string;
  const position_name = formData.get("position_name") as string;
  const level_code = formData.get("level_code") as string;
  const wa_number = formData.get("wa_number") as string;
  const email = (formData.get("email") as string)?.trim().toLowerCase() || "";
  const current_salary_amount = formData.get("current_salary_amount") as string;
  const expected_salary_amount = formData.get("expected_salary_amount") as string;
  const ta_pic_name = formData.get("ta_pic_name") as string;
  const cv_asli_url_text = formData.get("cv_asli_url") as string;
  const cv_asli_file = formData.get("cv_asli_file") as File | null;
  const candidate_source_code = formData.get("candidate_source_code") as string;
  const notes = formData.get("notes") as string;
  const candidate_open_status_code = formData.get("candidate_open_status_code") as string;
  const cv_summary = formData.get("cv_summary") as string;

  // Sama seperti createCandidate: validasi/upload semua file dulu sebelum
  // update DB, supaya format file yang ditolak nggak nyisain data setengah
  // ke-update (mis. attachment lama kehapus tapi field lain nggak ke-update).
  let cv_asli_url: string | undefined = undefined;
  if (cv_asli_file && cv_asli_file.size > 0) {
    cv_asli_url = await uploadDocument(cv_asli_file, id, "cv_asli");
  } else if (cv_asli_url_text) {
    cv_asli_url = cv_asli_url_text;
  }

  const newFiles = extractFiles(formData, "cv_attachments");
  const newLinks = extractLinks(formData, "cv_attachments_links");
  if (newFiles.length > 0 || newLinks.length > 0) {
    await saveAttachmentsAndLinks(CANDIDATE_CV_ASLI_SOURCE, id, { files: newFiles, links: newLinks }, ta_pic_name);
  }

  await db.update(candidates).set({
    candidate_date: candidate_date || undefined,
    candidate_name,
    position_name: position_name || null,
    level_code: level_code || null,
    wa_number: wa_number || null,
    email: email || null,
    current_salary_amount: current_salary_amount ? Number(current_salary_amount) : null,
    expected_salary_amount: expected_salary_amount ? Number(expected_salary_amount) : null,
    ta_pic_name,
    ...(cv_asli_url !== undefined ? { cv_asli_url } : {}),
    candidate_source_code: candidate_source_code || null,
    notes,
    candidate_open_status_code: candidate_open_status_code || null,
    cv_summary: cv_summary || null,
  }).where(eq(candidates.id, id));

  await logActivity("ta", "update", `Candidate: ${candidate_name}`, "Candidate");
  revalidatePath("/ta/candidates");
  revalidatePath("/ta/pipeline");
  revalidatePath("/ta/onboarding");
  await markSaved();
  redirect("/ta/candidates");
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteCandidate(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("ta", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const linkedApplications = await db.select().from(applications).where(eq(applications.candidate_id, id));
  if (linkedApplications.length > 0) {
    return { ok: false, error: "Candidate ini sudah masuk Hiring Pipeline, tidak bisa dihapus." };
  }
  const linkedOnboarding = await db.select().from(onboardingRequests).where(eq(onboardingRequests.candidate_id, id));
  if (linkedOnboarding.length > 0) {
    return { ok: false, error: "Candidate ini sudah punya Onboarding Request, tidak bisa dihapus." };
  }

  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id));
  await db.delete(candidates).where(eq(candidates.id, id));
  await logActivity("ta", "delete", `Candidate: ${candidate?.candidate_name ?? id}`, "Candidate");
  revalidatePath("/ta/candidates");
  return { ok: true };
}