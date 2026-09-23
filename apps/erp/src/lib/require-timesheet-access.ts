import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireDivisionAccess, type AccessLevel } from "./require-division-access";

export type TimesheetActor = {
  userId: string;
  userName: string;
  isOwner: boolean;
  isTalent: boolean;
  canConverter: boolean;
};

/**
 * Modul Timesheet lepas total dari employees/opportunities -- semua record
 * cuma nempel ke `users.id`. Dua jenis actor yang boleh masuk:
 * - Talent (account_type "talent"): cuma boleh baca/tulis record MILIK SENDIRI.
 * - Backoffice dengan akses divisi "pmo" level "full" (atau Owner): boleh
 *   bertindak atas SEMUA record (dia yang review/approve/administer modul ini).
 *
 * Ini dipanggil dari tiap Server Action, bukan cuma disembunyikan di UI --
 * own-record-only harus dicek di server, sama seperti pola signer_user_id di
 * TTD Online (src/app/ttd-online/actions.ts).
 */
export async function currentTimesheetActor(): Promise<TimesheetActor> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const userName = ((session?.user as any)?.fullName ?? session?.user?.name ?? session?.user?.email ?? "Seseorang") as string;
  const isOwner = Boolean((session?.user as any)?.isOwner);
  const accountType = ((session?.user as any)?.accountType ?? "backoffice") as string;
  const canConverter = Boolean((session?.user as any)?.canUseTimesheetConverter);

  if (!userId) throw new Error("Sesi tidak valid, silakan login ulang");

  return { userId, userName, isOwner, isTalent: accountType === "talent", canConverter };
}

/**
 * Cek server-side bahwa actor boleh bertindak atas record `recordUserId`.
 * Talent hanya lolos kalau `recordUserId === actor.userId`. Backoffice wajib
 * requireDivisionAccess("pmo", minLevel) (Owner selalu lolos).
 */
export async function assertCanActOnTimesheetRecord(
  actor: TimesheetActor,
  recordUserId: string,
  minLevel: AccessLevel = "editor"
): Promise<void> {
  if (actor.isOwner) return;
  if (actor.isTalent) {
    if (recordUserId !== actor.userId) {
      throw new Error("Anda cuma bisa mengelola timesheet milik Anda sendiri");
    }
    return;
  }
  await requireDivisionAccess("pmo", minLevel);
}

/**
 * Dipakai untuk aksi yang cuma boleh dilakukan staff PMO full (review/approve
 * submission siapa pun, kelola kalender hari libur, dst) -- Talent selalu
 * ditolak di sini walau itu Server Action miliknya, karena ini bukan aksi
 * "punya sendiri" tapi aksi administratif.
 */
export async function requirePmoFullOrOwner(minLevel: AccessLevel = "full"): Promise<TimesheetActor> {
  const actor = await currentTimesheetActor();
  if (actor.isOwner) return actor;
  if (actor.isTalent) throw new Error("Aksi ini cuma bisa dilakukan oleh PMO");
  await requireDivisionAccess("pmo", minLevel);
  return actor;
}

/** Talent eligible converter kalau canConverter true; backoffice-pmo-full/Owner selalu boleh. */
export async function requireConverterAccess(): Promise<TimesheetActor> {
  const actor = await currentTimesheetActor();
  if (actor.isOwner) return actor;
  if (actor.isTalent) {
    if (!actor.canConverter) throw new Error("Anda belum diberi akses ke Timesheet Converter. Hubungi PMO/Owner.");
    return actor;
  }
  await requireDivisionAccess("pmo", "full");
  return actor;
}
