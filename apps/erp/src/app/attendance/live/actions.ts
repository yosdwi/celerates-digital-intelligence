"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { attendanceLogs } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/activity-log";
import { currentAttendanceActor } from "@/lib/require-attendance-access";
import { uploadDocument } from "@/lib/storage";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Selalu bikin sesi baru -- 1 user bisa check-in berkali-kali sehari, tiap sesi masuk log sendiri-sendiri. */
export async function checkIn(lat: number | null, lng: number | null, selfie: File): Promise<ActionResult> {
  await requirePilotActor();

  let actor;
  try {
    actor = await currentAttendanceActor();
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  if (!selfie || selfie.size === 0) return { ok: false, error: "Selfie wajib diambil untuk check-in." };

  const work_date = todayDate();

  let photoPath: string;
  try {
    photoPath = await uploadDocument(selfie, actor.userId, `attendance-${work_date}-in-${randomUUID()}`);
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Gagal upload selfie." };
  }

  await db.insert(attendanceLogs).values({
    user_id: actor.userId,
    work_date,
    check_in_at: new Date(),
    check_in_lat: lat,
    check_in_lng: lng,
    check_in_photo_path: photoPath,
  });

  await logActivity("attendance", "create", `Check-in: ${actor.userName}`, "Attendance");
  revalidatePath("/attendance");
  revalidatePath("/attendance/live");
  revalidatePath("/attendance/history");
  revalidatePath("/hr/attendance");
  return { ok: true, data: undefined };
}

/** Nutup sesi yang lagi terbuka PALING BARU milik user ini (check_out_at masih null). */
export async function checkOut(lat: number | null, lng: number | null, selfie: File): Promise<ActionResult> {
  await requirePilotActor();

  let actor;
  try {
    actor = await currentAttendanceActor();
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  if (!selfie || selfie.size === 0) return { ok: false, error: "Selfie wajib diambil untuk check-out." };

  const [openSession] = await db
    .select({ id: attendanceLogs.id })
    .from(attendanceLogs)
    .where(and(eq(attendanceLogs.user_id, actor.userId), isNull(attendanceLogs.check_out_at)))
    .orderBy(desc(attendanceLogs.check_in_at))
    .limit(1);
  if (!openSession) return { ok: false, error: "Tidak ada sesi check-in yang masih terbuka." };

  const work_date = todayDate();
  let photoPath: string;
  try {
    photoPath = await uploadDocument(selfie, actor.userId, `attendance-${work_date}-out-${randomUUID()}`);
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Gagal upload selfie." };
  }

  await db.update(attendanceLogs).set({
    check_out_at: new Date(),
    check_out_lat: lat,
    check_out_lng: lng,
    check_out_photo_path: photoPath,
  }).where(eq(attendanceLogs.id, openSession.id));

  await logActivity("attendance", "update", `Check-out: ${actor.userName}`, "Attendance");
  revalidatePath("/attendance");
  revalidatePath("/attendance/live");
  revalidatePath("/attendance/history");
  revalidatePath("/hr/attendance");
  return { ok: true, data: undefined };
}
