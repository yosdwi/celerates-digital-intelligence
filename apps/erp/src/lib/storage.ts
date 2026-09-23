import { randomUUID } from "node:crypto";
import { requirePilotActor } from "@/lib/actor";
import { objectUrl, putObject } from "@/lib/object-store";
const BUCKET = "candidate-documents";
const types: Record<string,string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };
import { VIDEO_MAX_SIZE_BYTES } from "./upload-limits";
export { VIDEO_MAX_SIZE_BYTES } from "./upload-limits";
export async function uploadDocument(file: File, candidateId: string, docType: string, options?: { maxSizeBytes?: number }): Promise<string> {
  await requirePilotActor();
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!types[ext]) throw new Error("Tipe file tidak diizinkan.");
  if (file.size > Math.min(options?.maxSizeBytes ?? VIDEO_MAX_SIZE_BYTES, VIDEO_MAX_SIZE_BYTES)) throw new Error("Maksimum file 20 MB pada pilot.");
  return putObject(BUCKET, `${candidateId}/${docType}-${randomUUID()}.${ext}`, Buffer.from(await file.arrayBuffer()), types[ext]);
}
export async function getDocumentUrl(path: string): Promise<string | null> {
  await requirePilotActor();
  return path ? objectUrl(BUCKET, path) : null;
}
export async function getDocumentUrls(paths: string[]): Promise<Record<string, string | null>> {
  await requirePilotActor();
  return Object.fromEntries([...new Set(paths.filter(Boolean))].map(path => [path, objectUrl(BUCKET, path)]));
}
