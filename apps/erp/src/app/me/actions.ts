"use server";
// Talent self-service (doc 19 §6). The ConForm employee is always taken from the caller's active identity link;
// ConForm re-validates that the day still needs a correction before it stores anything.
import { revalidatePath } from "next/cache";
import { conform, ConformError } from "@/lib/conform/client";
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
    return { ok: true, status: result.status };
  } catch (error) {
    if (error instanceof ConformError) {
      if (error.code === "requirement_not_actionable") return { ok: false, error: "Tanggal ini sudah tidak perlu dilengkapi. Muat ulang halaman." };
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Pengajuan belum terkirim. Coba lagi." };
  }
}
