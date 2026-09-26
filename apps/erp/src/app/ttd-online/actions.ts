"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { signatures, signatureRequests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { uploadDocument } from "@/lib/storage";
import { createNotification } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";
import { EXTENSION_REQUEST_SOURCE, advanceExtensionRequestJourney, rejectExtensionRequestJourney } from "@/lib/approval-journey";
import { saveAttachmentsAndLinks, extractFiles, extractLinks, deleteAttachment } from "@/lib/attachments";
import { SIGNATURE_REQUEST_DOCUMENT_SOURCE } from "./constants";
import { PQ_SIGNATURE_SOURCE } from "@/app/sales/pq-constants";
import { onPqSigned } from "@/lib/pq-approval";

async function currentUser() {
  const session = await getServerSession(authOptions);
  const id = (session?.user as any)?.id as string | undefined;
  const name = (session?.user as any)?.fullName ?? session?.user?.name ?? session?.user?.email ?? "Seseorang";
  return { id, name: name as string };
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveSignature(file: File): Promise<ActionResult> {
  await requirePilotActor();

  const { id: userId } = await currentUser();
  if (!userId) return { ok: false, error: "Belum login" };

  const path = await uploadDocument(file, userId, "signature");

  const [existing] = await db.select().from(signatures).where(eq(signatures.user_id, userId));
  if (existing) {
    await db.update(signatures).set({ image_path: path, updated_at: new Date() }).where(eq(signatures.id, existing.id));
  } else {
    await db.insert(signatures).values({ user_id: userId, image_path: path });
  }

  revalidatePath("/ttd-online");
  return { ok: true };
}

export async function createSignatureRequest(formData: FormData): Promise<ActionResult> {
  await requirePilotActor();

  const { id: requesterId, name: requesterName } = await currentUser();
  if (!requesterId) return { ok: false, error: "Belum login" };

  const document_title = formData.get("document_title") as string;
  const signer_user_id = formData.get("signer_user_id") as string;
  const notes = (formData.get("notes") as string) || null;
  const document_url_text = (formData.get("document_url") as string) || null;
  const document_file = formData.get("document_file") as File | null;

  if (!document_title || !signer_user_id) return { ok: false, error: "Judul dokumen dan Signer wajib diisi" };
  if (signer_user_id === requesterId) return { ok: false, error: "Tidak bisa meminta TTD ke diri sendiri" };

  const id = randomUUID();
  let document_url = document_url_text;
  if (document_file && document_file.size > 0) {
    document_url = await uploadDocument(document_file, id, "ttd_document");
  }

  await db.insert(signatureRequests).values({
    id,
    document_title,
    document_url,
    requested_by_user_id: requesterId,
    signer_user_id,
    notes,
  });

  const extraFiles = extractFiles(formData, "attachments");
  const extraLinks = extractLinks(formData, "attachments_links");
  if (extraFiles.length > 0 || extraLinks.length > 0) {
    await saveAttachmentsAndLinks(SIGNATURE_REQUEST_DOCUMENT_SOURCE, id, { files: extraFiles, links: extraLinks }, requesterName);
  }

  await createNotification(
    signer_user_id,
    "Permintaan Tanda Tangan Baru",
    `${requesterName} meminta Anda menandatangani dokumen "${document_title}".`,
    "/ttd-online"
  );

  await logActivity("ttd", "create", `Permintaan TTD: ${document_title}`, "TTD Online");
  revalidatePath("/ttd-online");
  return { ok: true };
}

export async function deleteSignatureRequestAttachment(attachmentId: string) {
  await requirePilotActor();

  await deleteAttachment(attachmentId);
  await logActivity("ttd", "delete", "Lampiran dokumen TTD dihapus", "TTD Online");
  revalidatePath("/ttd-online");
}

export async function signRequest(id: string): Promise<ActionResult> {
  await requirePilotActor();

  const { id: userId, name: userName } = await currentUser();
  if (!userId) return { ok: false, error: "Belum login" };

  const [request] = await db.select().from(signatureRequests).where(eq(signatureRequests.id, id));
  if (!request) return { ok: false, error: "Permintaan tidak ditemukan" };
  if (request.signer_user_id !== userId) return { ok: false, error: "Anda bukan signer untuk dokumen ini" };
  if (request.status_code !== "pending") return { ok: false, error: "Permintaan ini sudah diproses" };

  const [signature] = await db.select().from(signatures).where(eq(signatures.user_id, userId));
  if (!signature) return { ok: false, error: "Anda belum punya tanda tangan tersimpan. Buat dulu di bagian 'Tanda Tangan Saya'." };

  await db.update(signatureRequests).set({ status_code: "signed", signed_at: new Date() }).where(eq(signatureRequests.id, id));

  await createNotification(
    request.requested_by_user_id,
    "Dokumen Sudah Ditandatangani",
    `${userName} sudah menandatangani dokumen "${request.document_title}".`,
    "/ttd-online"
  );

  if (request.source_type === EXTENSION_REQUEST_SOURCE && request.source_id && request.step_code) {
    await advanceExtensionRequestJourney(request.source_id, request.step_code, userName);
    revalidatePath("/tm/extension-requests");
  }

  if (request.source_type === PQ_SIGNATURE_SOURCE && request.source_id) {
    await onPqSigned(request.source_id);
    revalidatePath("/sales");
    revalidatePath("/tm");
    revalidatePath("/pmo/contracts");
  }

  await logActivity("ttd", "update", `Dokumen ditandatangani: ${request.document_title}`, "TTD Online");
  revalidatePath("/ttd-online");
  return { ok: true };
}

export async function rejectRequest(id: string, formData: FormData): Promise<ActionResult> {
  await requirePilotActor();

  const { id: userId, name: userName } = await currentUser();
  if (!userId) return { ok: false, error: "Belum login" };

  const [request] = await db.select().from(signatureRequests).where(eq(signatureRequests.id, id));
  if (!request) return { ok: false, error: "Permintaan tidak ditemukan" };
  if (request.signer_user_id !== userId) return { ok: false, error: "Anda bukan signer untuk dokumen ini" };
  if (request.status_code !== "pending") return { ok: false, error: "Permintaan ini sudah diproses" };

  const reject_reason = (formData.get("reject_reason") as string) || null;

  await db.update(signatureRequests).set({ status_code: "rejected", reject_reason }).where(eq(signatureRequests.id, id));

  await createNotification(
    request.requested_by_user_id,
    "Permintaan Tanda Tangan Ditolak",
    `${userName} menolak menandatangani dokumen "${request.document_title}"${reject_reason ? `: ${reject_reason}` : "."}`,
    "/ttd-online"
  );

  if (request.source_type === EXTENSION_REQUEST_SOURCE && request.source_id) {
    await rejectExtensionRequestJourney(request.source_id, userName, reject_reason);
    revalidatePath("/tm/extension-requests");
  }

  await logActivity("ttd", "update", `Dokumen ditolak: ${request.document_title}`, "TTD Online");
  revalidatePath("/ttd-online");
  return { ok: true };
}

export async function deleteSignatureRequest(id: string): Promise<ActionResult> {
  await requirePilotActor();

  const { id: userId } = await currentUser();
  const [request] = await db.select().from(signatureRequests).where(eq(signatureRequests.id, id));
  if (!request) return { ok: false, error: "Permintaan tidak ditemukan" };
  if (request.requested_by_user_id !== userId) return { ok: false, error: "Hanya pembuat permintaan yang bisa menghapus" };
  if (request.status_code !== "pending") return { ok: false, error: "Cuma permintaan pending yang bisa dihapus" };

  await db.delete(signatureRequests).where(eq(signatureRequests.id, id));
  await logActivity("ttd", "delete", `Permintaan TTD dihapus: ${request.document_title}`, "TTD Online");
  revalidatePath("/ttd-online");
  return { ok: true };
}
