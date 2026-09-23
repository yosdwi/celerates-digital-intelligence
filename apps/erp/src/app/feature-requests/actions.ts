"use server";
import { requirePilotActor } from "@/lib/actor";
import { safeContextPath, safeExternalLink } from "@/lib/access-policy";
import { db } from "@/db";
import { featureRequests, users } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markSaved } from "@/lib/saved-flag";
import { eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { createNotification } from "@/lib/notifications";
import { saveAttachmentsAndLinks, extractFiles, extractLinks, deleteAttachment } from "@/lib/attachments";
import { FEATURE_REQUEST_ATTACHMENT_SOURCE, STATUS_LABELS } from "./constants";

async function currentUser() {
  const session = await getServerSession(authOptions);
  const id = (session?.user as any)?.id as string | undefined;
  const isOwner = Boolean((session?.user as any)?.isOwner);
  const name = (session?.user as any)?.fullName ?? session?.user?.name ?? session?.user?.email ?? "Seseorang";
  const email = session?.user?.email ?? null;
  return { id, isOwner, name: name as string, email };
}

async function generateRequestNo(): Promise<string> {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  for (let i = 0; i < 5; i++) {
    const seq = String(Math.floor(1 + Math.random() * 999)).padStart(3, "0");
    const candidate = `FR-${ymd}-${seq}`;
    const existing = await db.select().from(featureRequests).where(eq(featureRequests.request_no, candidate));
    if (existing.length === 0) return candidate;
  }
  return `FR-${ymd}-${Date.now()}`;
}

async function notifyOwners(title: string, body: string, link: string) {
  const owners = await db.select({ id: users.id }).from(users).where(eq(users.is_owner, true));
  for (const o of owners) {
    await createNotification(o.id, title, body, link);
  }
}

export async function createFeatureRequest(formData: FormData): Promise<void> {
  await requirePilotActor();

  const { id: userId, name: userName, email } = await currentUser();

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  if (!title || !description) throw new Error("Judul dan Deskripsi wajib diisi");

  const module_area_code = (formData.get("module_area_code") as string) || null;
  const request_type_code = (formData.get("request_type_code") as string) || "new_feature";
  const priority_code = (formData.get("priority_code") as string) || "medium";
  const current_behavior = (formData.get("current_behavior") as string) || null;
  const expected_behavior = (formData.get("expected_behavior") as string) || null;
  const business_impact = (formData.get("business_impact") as string) || null;
  const target_date = (formData.get("target_date") as string) || null;

  const request_no = await generateRequestNo();

  const [{ id: newId }] = await db.insert(featureRequests).values({
    request_no,
    title,
    module_area_code,
    request_type_code,
    priority_code,
    description,
    current_behavior,
    expected_behavior,
    business_impact,
    context_path: safeContextPath(formData.get("context_path")),
    release_sha: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RELEASE_SHA || "local",
    environment: process.env.APP_ENV || "erp-pilot",
    requested_by_user_id: userId ?? null,
    requested_by_name: userName,
    requested_by_email: email,
    target_date,
  }).returning({ id: featureRequests.id });

  const files = extractFiles(formData, "attachments");
  const links = extractLinks(formData, "attachments_links");
  if (files.length > 0 || links.length > 0) {
    await saveAttachmentsAndLinks(FEATURE_REQUEST_ATTACHMENT_SOURCE, newId, { files, links }, userName);
  }

  await notifyOwners(
    "Feature Request Baru",
    `${userName} mengajukan request "${title}" (${request_no}).`,
    "/feature-requests"
  );

  await logActivity("feature-requests", "create", `Feature Request: ${title} (${request_no})`, "Feature Request");
  revalidatePath("/feature-requests");
}

export async function updateFeatureRequest(id: string, formData: FormData): Promise<void> {
  await requirePilotActor();

  const { name: userName } = await currentUser();

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  if (!title || !description) throw new Error("Judul dan Deskripsi wajib diisi");

  await db.update(featureRequests).set({
    title,
    description,
    module_area_code: (formData.get("module_area_code") as string) || null,
    request_type_code: (formData.get("request_type_code") as string) || "new_feature",
    priority_code: (formData.get("priority_code") as string) || "medium",
    current_behavior: (formData.get("current_behavior") as string) || null,
    expected_behavior: (formData.get("expected_behavior") as string) || null,
    business_impact: (formData.get("business_impact") as string) || null,
    target_date: (formData.get("target_date") as string) || null,
    updated_at: new Date(),
  }).where(eq(featureRequests.id, id));

  const files = extractFiles(formData, "attachments");
  const links = extractLinks(formData, "attachments_links");
  if (files.length > 0 || links.length > 0) {
    await saveAttachmentsAndLinks(FEATURE_REQUEST_ATTACHMENT_SOURCE, id, { files, links }, userName);
  }

  await logActivity("feature-requests", "update", "Feature Request diperbarui", "Feature Request");
  revalidatePath("/feature-requests");
  await markSaved();
  redirect("/feature-requests");
}

export type UpdateStatusResult = { ok: true } | { ok: false; error: string };

/** Owner-only: pindah status, assign PIC, isi catatan resolusi -- lalu notif requester aslinya. */
export async function updateFeatureRequestStatus(id: string, formData: FormData): Promise<UpdateStatusResult> {
  await requirePilotActor();

  const { isOwner, name: actorName } = await currentUser();
  if (!isOwner) return { ok: false, error: "Hanya Owner yang bisa mengubah status" };

  const status_code = formData.get("status_code") as string;
  const assigned_to_name = (formData.get("assigned_to_name") as string) || null;
  const resolution_notes = (formData.get("resolution_notes") as string) || null;
  if (!Object.hasOwn(STATUS_LABELS, status_code)) return { ok: false, error: "Status tidak valid" };
  const [prior] = await db.select().from(featureRequests).where(eq(featureRequests.id, id));
  if (!prior) return { ok: false, error: "Request tidak ditemukan" };
  const acceptance_criteria = String(formData.get("acceptance_criteria") || prior.acceptance_criteria || "").trim();
  const delivered_release = String(formData.get("delivered_release") || prior.delivered_release || "").trim();
  const validation_notes = String(formData.get("validation_notes") || prior.validation_notes || "").trim();
  const rawLink = String(formData.get("backlog_url") || prior.backlog_url || "").trim();
  let backlog_url: string | null = null;
  try { backlog_url = rawLink ? safeExternalLink(rawLink) : null; } catch { return { ok: false, error: "Link backlog tidak valid" }; }
  if (status_code === "done" && (!acceptance_criteria || !delivered_release || !validation_notes)) return { ok: false, error: "Done memerlukan acceptance criteria, rilis, dan bukti validasi BA." };

  await db.update(featureRequests).set({
    status_code,
    acceptance_criteria, delivered_release, validation_notes, backlog_url,
    assigned_to_name,
    resolution_notes,
    updated_at: new Date(),
  }).where(eq(featureRequests.id, id));

  const [request] = await db.select().from(featureRequests).where(eq(featureRequests.id, id));
  if (request?.requested_by_user_id) {
    await createNotification(
      request.requested_by_user_id,
      "Update Feature Request",
      `${actorName} mengubah status request "${request.title}" (${request.request_no}) jadi "${STATUS_LABELS[status_code] ?? status_code}"${resolution_notes ? `: ${resolution_notes}` : "."}`,
      "/feature-requests"
    );
  }

  await logActivity("feature-requests", "update", `Status Feature Request diubah jadi ${STATUS_LABELS[status_code] ?? status_code}`, "Feature Request");
  revalidatePath("/feature-requests");
  return { ok: true };
}

export async function deleteFeatureRequestAttachment(attachmentId: string) {
  await requirePilotActor();

  await deleteAttachment(attachmentId);
  await logActivity("feature-requests", "delete", "Lampiran Feature Request dihapus", "Feature Request");
  revalidatePath("/feature-requests");
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteFeatureRequest(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  const { id: userId, isOwner } = await currentUser();
  const [request] = await db.select().from(featureRequests).where(eq(featureRequests.id, id));
  if (!request) return { ok: false, error: "Request tidak ditemukan" };

  const isRequester = request.requested_by_user_id === userId;
  if (!isOwner && !(isRequester && request.status_code === "new")) {
    return { ok: false, error: "Cuma Owner atau pembuat request (selama masih status 'New') yang bisa menghapus" };
  }

  await db.delete(featureRequests).where(eq(featureRequests.id, id));
  await logActivity("feature-requests", "delete", `Feature Request dihapus: ${request.title}`, "Feature Request");
  revalidatePath("/feature-requests");
  return { ok: true };
}
