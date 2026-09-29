"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { automationDocumentTemplates, automationGeneratedDocuments } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { logActivity } from "@/lib/activity-log";
import { uploadTemplate } from "@/lib/automation/storage";
import { generateDocumentFromTemplate, previewDocumentFromTemplate, type PreviewResult } from "@/lib/automation/document-merge";

export async function createTemplate(formData: FormData): Promise<void> {
  await requirePilotActor();

  const actor = await requireDivisionAccess("automation");

  const type = formData.get("type") as "contract" | "offering";
  const name = formData.get("name") as string;
  const file = formData.get("file") as File;
  if (!type || !name) throw new Error("Tipe dan nama template wajib diisi");
  if (!file || file.size === 0) throw new Error("File template (.docx) wajib diupload");

  const storagePath = await uploadTemplate(file, type);

  await db.insert(automationDocumentTemplates).values({
    type, name, storage_path: storagePath, uploaded_by_user_id: actor.userId,
  });

  await logActivity("automation", "create", `Template ${type}: ${name}`, "Document Generator");
  revalidatePath("/automation/documents");
}

export async function deleteTemplate(id: string): Promise<void> {
  await requirePilotActor();

  await requireDivisionAccess("automation", "full");
  await db.delete(automationDocumentTemplates).where(eq(automationDocumentTemplates.id, id));
  await logActivity("automation", "delete", "Template dihapus", "Document Generator");
  revalidatePath("/automation/documents");
}

export type PreviewActionResult = { ok: true; preview: PreviewResult } | { ok: false; error: string };

export async function previewDocument(templateId: string, onboardingRequestId: string): Promise<PreviewActionResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("automation");
    if (!templateId || !onboardingRequestId) throw new Error("Pilih template dan onboarding record dulu");
    const preview = await previewDocumentFromTemplate(templateId, onboardingRequestId);
    return { ok: true, preview };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Gagal membuat preview" };
  }
}

export type GenerateResult = { ok: true; signedUrl: string } | { ok: false; error: string };

export async function generateDocument(templateId: string, onboardingRequestId: string): Promise<GenerateResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("automation");
    if (!templateId || !onboardingRequestId) throw new Error("Pilih template dan onboarding record dulu");
    const { signedUrl } = await generateDocumentFromTemplate(templateId, onboardingRequestId);
    await logActivity("automation", "create", "Dokumen digenerate dari template", "Document Generator");
    revalidatePath("/automation/documents");
    return { ok: true, signedUrl };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Gagal generate dokumen" };
  }
}

export async function deleteGeneratedDocument(id: string): Promise<void> {
  await requirePilotActor();

  await requireDivisionAccess("automation", "full");
  await db.delete(automationGeneratedDocuments).where(eq(automationGeneratedDocuments.id, id));
  await logActivity("automation", "delete", "Riwayat dokumen digenerate dihapus", "Document Generator");
  revalidatePath("/automation/documents");
}
