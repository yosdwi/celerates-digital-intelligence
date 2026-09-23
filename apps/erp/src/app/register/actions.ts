"use server";
import { integrationDisabled } from "@/lib/integration-policy";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export type RegisterResult = { ok: true } | { ok: false; error: string };

export async function registerUser(formData: FormData): Promise<RegisterResult> {
  await integrationDisabled();

  const full_name = formData.get("full_name") as string;
  const role_title = formData.get("role_title") as string;
  const account_type = (formData.get("account_type") as string) === "talent" ? "talent" : "backoffice";
  const requested_division_id = formData.get("requested_division_id") as string;
  const email = (formData.get("email") as string).trim().toLowerCase();
  const password = formData.get("password") as string;
  const confirm_password = formData.get("confirm_password") as string;

  // Talent tidak pilih divisi sama sekali -- cuma butuh biodata dasar.
  if (!full_name || !email || !password || (account_type === "backoffice" && !requested_division_id)) {
    return { ok: false, error: "Semua field wajib diisi" };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password minimal 8 karakter" };
  }
  if (password !== confirm_password) {
    return { ok: false, error: "Konfirmasi password tidak cocok" };
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    return { ok: false, error: "Email ini sudah terdaftar" };
  }

  const password_hash = await bcrypt.hash(password, 10);

  await db.insert(users).values({
    full_name,
    role_title: role_title || null,
    account_type,
    requested_division_id: account_type === "talent" ? null : requested_division_id,
    email,
    password_hash,
    status: "pending",
  });

  return { ok: true };
}