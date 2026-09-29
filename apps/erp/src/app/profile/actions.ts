"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";

export type ProfileResult = { ok: true } | { ok: false; error: string };

export async function updateProfile(formData: FormData): Promise<ProfileResult> {
  await requirePilotActor();

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, error: "Belum login" };

  const full_name = formData.get("full_name") as string;
  const role_title = formData.get("role_title") as string;

  if (!full_name) return { ok: false, error: "Nama lengkap wajib diisi" };

  await db.update(users).set({
    full_name,
    role_title: role_title || null,
  }).where(eq(users.email, session.user.email as string));

  return { ok: true };
}

export async function changePassword(formData: FormData): Promise<ProfileResult> {
  await requirePilotActor();

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, error: "Belum login" };

  const current_password = formData.get("current_password") as string;
  const new_password = formData.get("new_password") as string;
  const confirm_password = formData.get("confirm_password") as string;

  const [user] = await db.select().from(users).where(eq(users.email, session.user.email as string));
  if (!user || !user.password_hash) {
    return { ok: false, error: "Akun ini login via Google, tidak punya password untuk diganti" };
  }

  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) return { ok: false, error: "Password saat ini salah" };

  if (new_password.length < 8) return { ok: false, error: "Password baru minimal 8 karakter" };
  if (new_password !== confirm_password) return { ok: false, error: "Konfirmasi password tidak cocok" };

  const password_hash = await bcrypt.hash(new_password, 10);
  await db.update(users).set({ password_hash }).where(eq(users.id, user.id));

  return { ok: true };
}