import { requirePilotActor } from "@/lib/actor";
import { safeExternalLink } from "@/lib/access-policy";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { uploadDocument, getDocumentUrl, getDocumentUrls } from "@/lib/storage";

export type AttachmentInput = { files: File[]; links: string[] };

/** Simpan banyak file & link sekaligus untuk satu entitas (source_type + source_id). File kosong/link kosong diabaikan. */
export async function saveAttachmentsAndLinks(
  sourceType: string,
  sourceId: string,
  input: AttachmentInput,
  uploadedByName?: string | null,
  options?: { maxSizeBytes?: number }
) {
  for (const file of input.files) {
    if (!file || file.size === 0) continue;
    const path = await uploadDocument(file, `${sourceType}/${sourceId}`, randomUUID(), options);
    await db.insert(attachments).values({
      source_type: sourceType,
      source_id: sourceId,
      kind: "file",
      file_name: file.name,
      file_path: path,
      uploaded_by_name: uploadedByName ?? null,
    });
  }

  for (const rawUrl of input.links) {
    const url = safeExternalLink(rawUrl);
    if (!url) continue;
    await db.insert(attachments).values({
      source_type: sourceType,
      source_id: sourceId,
      kind: "link",
      file_name: url,
      link_url: url,
      uploaded_by_name: uploadedByName ?? null,
    });
  }
}

/** Kompatibilitas: simpan file saja (tanpa link). */
export async function saveAttachments(sourceType: string, sourceId: string, files: File[], uploadedByName?: string | null) {
  await saveAttachmentsAndLinks(sourceType, sourceId, { files, links: [] }, uploadedByName);
}

export type AttachmentWithUrl = {
  id: string;
  kind: "file" | "link";
  file_name: string;
  uploaded_by_name: string | null;
  created_at: Date;
  url: string | null;
};

export async function getAttachmentsWithUrls(sourceType: string, sourceId: string): Promise<AttachmentWithUrl[]> {
  const rows = await db.select().from(attachments)
    .where(and(eq(attachments.source_type, sourceType), eq(attachments.source_id, sourceId)))
    .orderBy(desc(attachments.created_at));

  const urlByPath = await getDocumentUrls(rows.filter((r) => r.kind !== "link" && r.file_path).map((r) => r.file_path!));

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind === "link" ? "link" : "file",
    file_name: r.file_name,
    uploaded_by_name: r.uploaded_by_name,
    created_at: r.created_at,
    url: r.kind === "link" ? r.link_url : (urlByPath[r.file_path!] ?? null),
  }));
}

/**
 * Versi batch dari getAttachmentsWithUrls -- 1 query DB buat banyak sourceId
 * sekaligus (bukan 1 query per baris di dalam loop), plus signed-URL Supabase
 * Storage di-generate lewat 1 batch request (getDocumentUrls), bukan 1
 * request per file -- pakai ini di halaman list yang butuh attachment per
 * baris, supaya nggak N+1 baik ke DB maupun ke Supabase Storage API.
 */
export async function getAttachmentsWithUrlsForMany(
  sourceType: string,
  sourceIds: string[]
): Promise<Record<string, AttachmentWithUrl[]>> {
  const grouped: Record<string, AttachmentWithUrl[]> = {};
  for (const id of sourceIds) grouped[id] = [];
  if (sourceIds.length === 0) return grouped;

  const rows = await db.select().from(attachments)
    .where(and(eq(attachments.source_type, sourceType), inArray(attachments.source_id, sourceIds)))
    .orderBy(desc(attachments.created_at));

  const urlByPath = await getDocumentUrls(rows.filter((r) => r.kind !== "link" && r.file_path).map((r) => r.file_path!));

  for (const r of rows) {
    grouped[r.source_id].push({
      id: r.id,
      kind: r.kind === "link" ? "link" : "file",
      file_name: r.file_name,
      uploaded_by_name: r.uploaded_by_name,
      created_at: r.created_at,
      url: r.kind === "link" ? r.link_url : (urlByPath[r.file_path!] ?? null),
    });
  }
  return grouped;
}

/**
 * Buat halaman yang butuh attachment dari BANYAK source_type sekaligus per
 * baris (mis. Onboarding: 9 jenis dokumen per request) -- 1 query DB dan 1
 * batch signed-URL buat semuanya, bukan 1 query+batch per jenis dokumen.
 */
export async function getAttachmentsWithUrlsForManySourceTypes(
  sourceTypes: string[],
  sourceIds: string[]
): Promise<Record<string, Record<string, AttachmentWithUrl[]>>> {
  const bySourceType: Record<string, Record<string, AttachmentWithUrl[]>> = {};
  for (const st of sourceTypes) {
    bySourceType[st] = {};
    for (const id of sourceIds) bySourceType[st][id] = [];
  }
  if (sourceIds.length === 0 || sourceTypes.length === 0) return bySourceType;

  const rows = await db.select().from(attachments)
    .where(and(inArray(attachments.source_type, sourceTypes), inArray(attachments.source_id, sourceIds)))
    .orderBy(desc(attachments.created_at));

  const urlByPath = await getDocumentUrls(rows.filter((r) => r.kind !== "link" && r.file_path).map((r) => r.file_path!));

  for (const r of rows) {
    bySourceType[r.source_type]?.[r.source_id]?.push({
      id: r.id,
      kind: r.kind === "link" ? "link" : "file",
      file_name: r.file_name,
      uploaded_by_name: r.uploaded_by_name,
      created_at: r.created_at,
      url: r.kind === "link" ? r.link_url : (urlByPath[r.file_path!] ?? null),
    });
  }
  return bySourceType;
}

export async function deleteAttachment(id: string) {
  await requirePilotActor();
  await db.delete(attachments).where(eq(attachments.id, id));
}

/** Ekstrak semua File valid dari sebuah field FormData multi-file (dukung `<input multiple>`). */
export function extractFiles(formData: FormData, fieldName: string): File[] {
  return formData.getAll(fieldName).filter((v): v is File => v instanceof File && v.size > 0);
}

/** Ekstrak semua URL link (teks) dari sebuah field FormData multi-value. */
export function extractLinks(formData: FormData, fieldName: string): string[] {
  return formData.getAll(fieldName).map((v) => String(v).trim()).filter(Boolean);
}
