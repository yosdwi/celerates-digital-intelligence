"use server";
// Talent self-service (doc 21 §6). The ConForm employee is always taken from the caller's active identity link;
// ConForm re-validates business state before it stores anything.
import { revalidatePath } from "next/cache";
import { conform, ConformError, qs, type TalentTasks } from "@/lib/conform/client";
import { requireTalentActor, talentActorTag } from "@/lib/talent/actor";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ACTIONS = new Set(["worked", "sakit", "izin", "cuti", "libur"]);
const NONCE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_BYTES = 5 * 1024 * 1024;

export type CorrectionResult = { ok: true; status: "submitted" | "already_open" } | { ok: false; error: string };

export async function submitAttendanceCorrection(formData: FormData): Promise<CorrectionResult> {
  await requireTalentActor();
  const actor = await requireTalentActor();
  const workDate = String(formData.get("work_date") ?? "");
  const action = String(formData.get("action") ?? "");
  const checkIn = String(formData.get("check_in") ?? "").trim();
  const checkOut = String(formData.get("check_out") ?? "").trim();
  const caption = String(formData.get("caption") ?? "").trim().slice(0, 500);
  const nonce = String(formData.get("nonce") ?? "");
  const file = formData.get("file");
  if (!DATE.test(workDate) || !ACTIONS.has(action) || !NONCE.test(nonce)) return { ok: false, error: "Permintaan tidak valid." };
  if ((checkIn && !TIME.test(checkIn)) || (checkOut && !TIME.test(checkOut))) return { ok: false, error: "Format jam harus HH:MM." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Lampirkan foto bukti." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Ukuran foto maksimal 5 MB." };
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return { ok: false, error: "Gunakan foto JPG, PNG, atau WebP." };

  const out = new FormData();
  out.set("employee_id", actor.link.conform_employee_id);
  out.set("work_date", workDate);
  out.set("action", action);
  if (checkIn) out.set("check_in", checkIn);
  if (checkOut) out.set("check_out", checkOut);
  out.set("caption", caption);
  out.set("file", file, file.name.slice(-100) || "bukti.jpg");
  try {
    const result = await conform.postForm<{ status: "submitted" | "already_open" }>("/talents/attendance-corrections", out, {
      actor: talentActorTag(actor),
      idempotencyKey: `talent:${actor.userId.slice(0, 8)}:${nonce}`,
      timeoutMs: 30000,
    });
    revalidatePath("/me");
    revalidatePath("/me/attendance");
    return { ok: true, status: result.status };
  } catch (error) {
    if (error instanceof ConformError) {
      if (error.code === "requirement_not_actionable") return { ok: false, error: "Tanggal ini sudah tidak perlu dilengkapi. Muat ulang halaman." };
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Pengajuan belum terkirim. Coba lagi." };
  }
}

export type TaskUploadResult = { ok: true; status: "saved" | "already_present" } | { ok: false; error: string };

/** One closed task owns at most one evidence image in the Talent UI. The staged ConForm transport is finalized immediately. */
export async function uploadTaskEvidence(formData: FormData): Promise<TaskUploadResult> {
  await requireTalentActor();
  const actor = await requireTalentActor();
  const taskKey = String(formData.get("task_key") ?? "");
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const caption = String(formData.get("caption") ?? "").trim().slice(0, 500);
  const nonce = String(formData.get("nonce") ?? "");
  const file = formData.get("file");
  if (!taskKey || taskKey.length > 200 || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || !NONCE.test(nonce)) return { ok: false, error: "Permintaan tidak valid." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Lampirkan foto bukti." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Ukuran foto maksimal 5 MB." };
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return { ok: false, error: "Gunakan foto JPG, PNG, atau WebP." };

  const actorTag = talentActorTag(actor);
  try {
    const tasks = await conform.get<TalentTasks>(`/talents/tasks${qs({ employee_id: actor.link.conform_employee_id, year, month })}`, { actor: actorTag });
    const task = tasks.items.find((item) => item.task_key === taskKey);
    if (!task) return { ok: false, error: "Task ini sudah berubah. Muat ulang halaman." };
    if (task.status.trim().toLowerCase() !== "closed") return { ok: false, error: "Evidence hanya dapat dilengkapi untuk task yang sudah Closed." };
    if (task.evidence_count > 0) return { ok: true, status: "already_present" };

    // A legacy staged evidence is already the one allowed evidence; finalize it instead of accepting another file.
    if (task.staged_count > 0) {
      await conform.post<{ status: string; count: number }>(
        "/talents/tasks/submit",
        { employee_id: actor.link.conform_employee_id, year, month },
        { actor: actorTag, idempotencyKey: `task-submit:${actor.userId.slice(0, 8)}:${nonce}` },
      );
      revalidatePath("/me/tasks");
      revalidatePath("/me");
      return { ok: true, status: "saved" };
    }

    const out = new FormData();
    out.set("employee_id", actor.link.conform_employee_id);
    out.set("year", String(year));
    out.set("month", String(month));
    out.set("caption", caption);
    out.set("file", file, file.name.slice(-100) || "bukti.jpg");
    const staged = await conform.postForm<{ status: "staged" | "already_present" }>(`/talents/tasks/${encodeURIComponent(taskKey)}/evidence`, out, {
      actor: actorTag,
      idempotencyKey: `task:${actor.userId.slice(0, 8)}:${nonce}`,
      timeoutMs: 30000,
    });
    if (staged.status === "already_present") return { ok: true, status: "already_present" };

    await conform.post<{ status: string; count: number }>(
      "/talents/tasks/submit",
      { employee_id: actor.link.conform_employee_id, year, month },
      { actor: actorTag, idempotencyKey: `task-submit:${actor.userId.slice(0, 8)}:${nonce}` },
    );
    revalidatePath("/me/tasks");
    revalidatePath("/me");
    return { ok: true, status: "saved" };
  } catch (error) {
    if (error instanceof ConformError) {
      if (error.code === "task_not_found" || error.code === "task_changed") return { ok: false, error: "Task ini sudah berubah. Muat ulang halaman." };
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Bukti belum tersimpan. Coba lagi." };
  }
}

/** Kept for older clients that still have staged evidence. New Talent UI finalizes evidence per task. */
export async function submitTaskEvidence(year: number, month: number, nonce: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  await requireTalentActor();
  const actor = await requireTalentActor();
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || !NONCE.test(nonce)) return { ok: false, error: "Permintaan tidak valid." };
  try {
    const result = await conform.post<{ status: string; count: number }>(
      "/talents/tasks/submit",
      { employee_id: actor.link.conform_employee_id, year, month },
      { actor: talentActorTag(actor), idempotencyKey: `task-submit:${actor.userId.slice(0, 8)}:${nonce}` },
    );
    revalidatePath("/me/tasks");
    revalidatePath("/me");
    return { ok: true, count: result.count };
  } catch (error) {
    if (error instanceof ConformError) {
      if (error.code === "nothing_staged") return { ok: false, error: "Belum ada bukti baru untuk diajukan." };
      if (error.code === "task_changed") return { ok: false, error: "Task sudah berubah. Muat ulang halaman lalu ajukan lagi." };
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Pengajuan belum terkirim. Coba lagi." };
  }
}
