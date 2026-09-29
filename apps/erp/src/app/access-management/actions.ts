"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { users, userAccess, divisions, googleTokens, sheetConnections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { formatDbError } from "@/lib/db-error";

async function requireOwner() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !(session.user as any).isOwner) {
    throw new Error("Cuma Owner yang boleh melakukan ini");
  }
  return session.user as any;
}

/** Owner ATAU Backoffice dengan akses divisi "pmo" level "full" -- dipakai khusus buat
 * kurasi akses Timesheet Converter per Talent (bukan cuma Owner, PMO full juga boleh). */
async function requireOwnerOrPmoFull() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!user) throw new Error("Sesi tidak valid, silakan login ulang");
  if (user.isOwner) return user;

  const access = (user.access ?? []) as { divisionKey: string; level: string }[];
  const hasPmoFull = access.some((a) => a.divisionKey === "pmo" && a.level === "full");
  if (!hasPmoFull) throw new Error("Cuma Owner atau PMO (akses Full) yang boleh melakukan ini");
  return user;
}

export async function approveUser(userId: string) {
  await requirePilotActor();

  const owner = await requireOwner();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error("User tidak ditemukan");

  await db.update(users).set({ status: "active" }).where(eq(users.id, userId));

  if (user.requested_division_id) {
    await db.insert(userAccess).values({
      user_id: userId,
      division_id: user.requested_division_id,
      level: "viewer",
      granted_by_user_id: owner.id,
    }).onConflictDoNothing();
  }

  revalidatePath("/access-management");
}

export async function rejectUser(userId: string) {
  await requirePilotActor();

  await requireOwner();
  await db.update(users).set({ status: "rejected" }).where(eq(users.id, userId));
  revalidatePath("/access-management");
}

export async function setUserAccess(userId: string, divisionId: string, level: string) {
  await requirePilotActor();

  const owner = await requireOwner();

  if (level === "none") {
    await db.delete(userAccess).where(and(eq(userAccess.user_id, userId), eq(userAccess.division_id, divisionId)));
  } else {
    const [existing] = await db.select().from(userAccess).where(and(eq(userAccess.user_id, userId), eq(userAccess.division_id, divisionId)));
    if (existing) {
      await db.update(userAccess).set({ level }).where(eq(userAccess.id, existing.id));
    } else {
      await db.insert(userAccess).values({ user_id: userId, division_id: divisionId, level, granted_by_user_id: owner.id });
    }
  }

  revalidatePath("/access-management");
}

export async function toggleOwner(userId: string, isOwner: boolean) {
  await requirePilotActor();

  await requireOwner();
  await db.update(users).set({ is_owner: isOwner }).where(eq(users.id, userId));
  revalidatePath("/access-management");
}

/**
 * Kurasi per-Talent apakah boleh pakai Timesheet Converter (client Astra dkk).
 * Cuma relevan untuk user account_type "talent" -- dibiarkan bisa dipanggil ke
 * user backoffice juga (kolomnya memang ada di semua baris users), tapi UI
 * cuma menampilkan toggle ini untuk baris Talent.
 */
export async function toggleTimesheetConverterAccess(userId: string, enabled: boolean) {
  await requirePilotActor();

  await requireOwnerOrPmoFull();
  await db.update(users).set({ can_use_timesheet_converter: enabled }).where(eq(users.id, userId));
  revalidatePath("/access-management");
}

export async function createDivision(formData: FormData) {
  await requirePilotActor();

  await requireOwner();
  const name = formData.get("name") as string;
  const key = formData.get("key") as string;
  if (!name || !key) throw new Error("Nama dan key wajib diisi");

  try {
    await db.insert(divisions).values({ name, key: key.toLowerCase().replace(/\s+/g, "_") });
  } catch (e) {
    throw new Error(formatDbError(e, { entityLabel: "Divisi dengan key ini" }));
  }
  revalidatePath("/access-management");
}

export type InviteResult = { ok: true } | { ok: false; error: string };

export async function inviteUser(formData: FormData): Promise<InviteResult> {
  await requirePilotActor();

  const owner = await requireOwner();

  const email = (formData.get("email") as string).trim().toLowerCase();
  const full_name = formData.get("full_name") as string;
  const division_id = formData.get("division_id") as string;
  const level = formData.get("level") as string;
  const make_owner = formData.get("make_owner") === "on";

  if (!email || !full_name) {
    return { ok: false, error: "Email dan nama wajib diisi" };
  }
  if (!make_owner && (!division_id || !level)) {
    return { ok: false, error: "Pilih divisi dan level akses (atau centang jadikan Owner)" };
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    return { ok: false, error: "Email ini sudah terdaftar" };
  }

  const [newUser] = await db.insert(users).values({
    email,
    full_name,
    status: "active",
    is_owner: make_owner,
  }).returning();

  if (!make_owner && division_id && level) {
    await db.insert(userAccess).values({
      user_id: newUser.id,
      division_id,
      level,
      granted_by_user_id: owner.id,
    });
  }

  revalidatePath("/access-management");
  return { ok: true };
}

export async function deleteUser(userId: string): Promise<InviteResult> {
  await requirePilotActor();

  const owner = await requireOwner();
  if (userId === owner.id) {
    return { ok: false, error: "Tidak bisa menghapus akun sendiri" };
  }

  await db.delete(userAccess).where(eq(userAccess.user_id, userId));
  await db.delete(googleTokens).where(eq(googleTokens.user_id, userId));
  await db.update(sheetConnections).set({ connected_by_user_id: null }).where(eq(sheetConnections.connected_by_user_id, userId));
  await db.delete(users).where(eq(users.id, userId));

  revalidatePath("/access-management");
  return { ok: true };
}

export async function updateUserInfo(userId: string, formData: FormData): Promise<InviteResult> {
  await requirePilotActor();

  await requireOwner();
  const full_name = formData.get("full_name") as string;
  const role_title = formData.get("role_title") as string;

  if (!full_name) return { ok: false, error: "Nama wajib diisi" };

  await db.update(users).set({ full_name, role_title: role_title || null }).where(eq(users.id, userId));
  revalidatePath("/access-management");
  return { ok: true };
}