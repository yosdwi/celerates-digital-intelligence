"use server";
import { requirePilotActor } from "@/lib/actor";
import { getDocumentUrl } from "./storage";
import { extractStoragePathFromSignedUrl } from "./storage-url";

export async function getDocumentSignedUrl(value: string | null): Promise<string | null> {
  await requirePilotActor();

  if (!value) return null;
  // Kalau value ternyata signed URL lama yang sudah/segera expired, ambil
  // path aslinya dan generate ulang -- jangan pakai token lamanya langsung.
  const path = extractStoragePathFromSignedUrl(value) ?? value;
  return getDocumentUrl(path);
}