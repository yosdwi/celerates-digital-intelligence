"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { kanbanTasks, kanbanTaskComments, attachments } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq, and, sql, asc, inArray } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { saveAttachmentsAndLinks, getAttachmentsWithUrls, getAttachmentsWithUrlsForMany, deleteAttachment, extractFiles, extractLinks } from "@/lib/attachments";
import { TASK_ATTACHMENT_SOURCE } from "./constants";

const STATUS_CODES = ["backlog", "todo", "in_progress", "in_review", "done"] as const;

function parseTags(raw: string | null): string[] | null {
  if (!raw) return null;
  const tags = [...new Set(raw.split(",").map((t) => t.trim()).filter(Boolean))];
  return tags.length > 0 ? tags : null;
}

async function currentUserName(): Promise<string> {
  const session = await getServerSession(authOptions);
  return (session?.user as any)?.fullName ?? session?.user?.name ?? session?.user?.email ?? "Seseorang";
}

async function generateTaskNo(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(kanbanTasks);
    const seq = Number(count) + 1 + Math.floor(Math.random() * 3);
    const candidate = `TASK-${seq}`;
    const existing = await db.select().from(kanbanTasks).where(eq(kanbanTasks.task_no, candidate));
    if (existing.length === 0) return candidate;
  }
  return `TASK-${Date.now()}`;
}

export async function createTask(formData: FormData) {
  await requirePilotActor();

  const creatorName = await currentUserName();

  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const priority_code = (formData.get("priority_code") as string) || "medium";
  const assignee_name = (formData.get("assignee_name") as string) || null;
  const start_date = (formData.get("start_date") as string) || null;
  const due_date = (formData.get("due_date") as string) || null;
  const status_code = (formData.get("status_code") as string) || "todo";
  const parent_id = (formData.get("parent_id") as string) || null;
  const tags = parseTags(formData.get("tags") as string);

  const [{ maxPosition }] = await db
    .select({ maxPosition: sql<number>`coalesce(max(${kanbanTasks.position}), -1)` })
    .from(kanbanTasks)
    .where(eq(kanbanTasks.status_code, status_code));

  const [{ id: newId }] = await db.insert(kanbanTasks).values({
    task_no: await generateTaskNo(),
    title,
    description,
    priority_code,
    assignee_name,
    start_date,
    due_date,
    status_code,
    parent_id,
    tags,
    position: Number(maxPosition) + 1,
    created_by_name: creatorName,
  }).returning({ id: kanbanTasks.id });

  const files = extractFiles(formData, "attachments");
  const links = extractLinks(formData, "attachments_links");
  if (files.length > 0 || links.length > 0) {
    await saveAttachmentsAndLinks(TASK_ATTACHMENT_SOURCE, newId, { files, links }, creatorName);
  }

  await logActivity("tasks", "create", `Task: ${title}`, "Task Board");
  revalidatePath("/tasks");
}

export async function updateTask(id: string, formData: FormData) {
  await requirePilotActor();

  const actorName = await currentUserName();

  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const priority_code = (formData.get("priority_code") as string) || "medium";
  const assignee_name = (formData.get("assignee_name") as string) || null;
  const start_date = (formData.get("start_date") as string) || null;
  const due_date = (formData.get("due_date") as string) || null;
  const parent_id = (formData.get("parent_id") as string) || null;
  const tags = parseTags(formData.get("tags") as string);

  if (parent_id === id) throw new Error("Task tidak bisa jadi parent dari dirinya sendiri");

  await db.update(kanbanTasks).set({
    title,
    description,
    priority_code,
    assignee_name,
    start_date,
    due_date,
    parent_id,
    tags,
    updated_at: new Date(),
  }).where(eq(kanbanTasks.id, id));

  const files = extractFiles(formData, "attachments");
  const links = extractLinks(formData, "attachments_links");
  if (files.length > 0 || links.length > 0) {
    await saveAttachmentsAndLinks(TASK_ATTACHMENT_SOURCE, id, { files, links }, actorName);
  }

  await logActivity("tasks", "update", `Task: ${title}`, "Task Board");
  revalidatePath("/tasks");
}

export async function deleteTaskAttachment(id: string) {
  await requirePilotActor();

  await deleteAttachment(id);
  revalidatePath("/tasks");
}

export async function getTaskAttachments(taskId: string) {
  await requirePilotActor();

  return getAttachmentsWithUrls(TASK_ATTACHMENT_SOURCE, taskId);
}

/** Jumlah lampiran per task -- dipakai buat badge di card, 1 query buat semua task sekaligus. */
export async function getTaskAttachmentCounts(taskIds: string[]): Promise<Record<string, number>> {
  await requirePilotActor();

  const byTask = await getAttachmentsWithUrlsForMany(TASK_ATTACHMENT_SOURCE, taskIds);
  const counts: Record<string, number> = {};
  for (const id of taskIds) counts[id] = byTask[id]?.length ?? 0;
  return counts;
}

export async function getTaskComments(taskId: string) {
  await requirePilotActor();

  return db.select().from(kanbanTaskComments).where(eq(kanbanTaskComments.task_id, taskId)).orderBy(asc(kanbanTaskComments.created_at));
}

/** Jumlah komentar per task -- 1 query agregat buat semua task sekaligus, dipakai badge di card. */
export async function getTaskCommentCounts(taskIds: string[]): Promise<Record<string, number>> {
  await requirePilotActor();

  const counts: Record<string, number> = {};
  for (const id of taskIds) counts[id] = 0;
  if (taskIds.length === 0) return counts;

  const rows = await db
    .select({ task_id: kanbanTaskComments.task_id, count: sql<number>`count(*)` })
    .from(kanbanTaskComments)
    .where(inArray(kanbanTaskComments.task_id, taskIds))
    .groupBy(kanbanTaskComments.task_id);

  for (const r of rows) counts[r.task_id] = Number(r.count);
  return counts;
}

export async function addTaskComment(taskId: string, body: string) {
  await requirePilotActor();

  if (!body.trim()) return;
  const authorName = await currentUserName();
  await db.insert(kanbanTaskComments).values({ task_id: taskId, author_name: authorName, body: body.trim() });
  revalidatePath("/tasks");
}

export async function deleteTaskComment(id: string) {
  await requirePilotActor();

  await db.delete(kanbanTaskComments).where(eq(kanbanTaskComments.id, id));
  revalidatePath("/tasks");
}

export type MoveResult = { ok: true } | { ok: false; error: string };

/** Dipanggil pas drag-drop kartu ke kolom lain -- taruh di posisi paling akhir kolom tujuan.
 * parentGroupId dikirim kalau kartu di-drop ke kolom milik grup (parent task) lain. */
export async function moveTask(id: string, newStatus: string, parentGroupId?: string | null): Promise<MoveResult> {
  await requirePilotActor();

  if (!(STATUS_CODES as readonly string[]).includes(newStatus)) return { ok: false, error: "Status tidak valid" };

  const [{ maxPosition }] = await db
    .select({ maxPosition: sql<number>`coalesce(max(${kanbanTasks.position}), -1)` })
    .from(kanbanTasks)
    .where(eq(kanbanTasks.status_code, newStatus));

  const [task] = await db.select().from(kanbanTasks).where(eq(kanbanTasks.id, id));

  await db.update(kanbanTasks).set({
    status_code: newStatus,
    position: Number(maxPosition) + 1,
    ...(parentGroupId !== undefined ? { parent_id: parentGroupId } : {}),
    updated_at: new Date(),
  }).where(eq(kanbanTasks.id, id));

  await logActivity("tasks", "update", `Task "${task?.title ?? id}" dipindah ke ${newStatus}`, "Task Board");
  revalidatePath("/tasks");
  return { ok: true };
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteTask(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  const [task] = await db.select().from(kanbanTasks).where(eq(kanbanTasks.id, id));
  await db.delete(kanbanTaskComments).where(eq(kanbanTaskComments.task_id, id));
  await db.delete(attachments).where(and(eq(attachments.source_type, TASK_ATTACHMENT_SOURCE), eq(attachments.source_id, id)));
  await db.delete(kanbanTasks).where(eq(kanbanTasks.id, id));
  await logActivity("tasks", "delete", `Task: ${task?.title ?? id}`, "Task Board");
  revalidatePath("/tasks");
  return { ok: true };
}
