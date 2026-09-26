import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { sql } from "@/db";
export async function bootstrapOwner(input: { token: string; email: string; name: string; password: string }) {
  const secret = process.env.SETUP_TOKEN || "";
  const a = Buffer.from(secret), b = Buffer.from(input.token);
  if (a.length < 32 || a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Setup tidak tersedia atau kode salah.");
  const email = input.email.trim().toLowerCase(), name = input.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 120 || input.password.length < 14 || input.password.length > 72) throw new Error("Gunakan email valid, nama, dan password 14–72 karakter.");
  const hash = await bcrypt.hash(input.password, 12);
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(731882002)`;
    const [existing] = await tx`SELECT id FROM users WHERE is_owner = true LIMIT 1`;
    if (existing) throw new Error("Setup sudah selesai.");
    await tx`INSERT INTO users (email, full_name, password_hash, status, is_owner) VALUES (${email}, ${name}, ${hash}, 'active', true)`;
  });
}
