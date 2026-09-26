import { randomUUID } from "node:crypto";
import { requirePilotActor } from "@/lib/actor";
import { objectUrl, putObject, readObject } from "@/lib/object-store";
const BUCKET = "automation-documents";
const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export async function uploadTemplate(file: File, type: "contract" | "offering"): Promise<string> {
  await requirePilotActor();
  if (!file.name.toLowerCase().endsWith(".docx")) throw new Error("Template harus berformat .docx");
  return putObject(BUCKET, `templates/${type}/${randomUUID()}.docx`, Buffer.from(await file.arrayBuffer()), MIME);
}
export async function downloadFromStorage(path: string): Promise<Buffer> {
  await requirePilotActor();
  return (await readObject(BUCKET, path)).body;
}
export async function uploadGeneratedDocument(buffer: Buffer, onboardingRequestId: string, type: "contract" | "offering", _fileName: string): Promise<string> {
  await requirePilotActor();
  return putObject(BUCKET, `generated/${onboardingRequestId}/${type}-${randomUUID()}.docx`, buffer, MIME);
}
export async function getSignedUrl(path: string): Promise<string | null> {
  await requirePilotActor();
  return objectUrl(BUCKET, path);
}
