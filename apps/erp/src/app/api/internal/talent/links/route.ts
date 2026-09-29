// WhatsApp re-entry (doc 22 R3.4): ConForm's bot asks Celerates for a fresh Talent link when a bound Talent sends
// "masuk". Celerates stays the grant authority: it decides whether an active, linked Talent account exists and mints
// a single-use grant that supersedes older ones. ConForm authenticates with the shared service token.
import { timingSafeEqual, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/db";
import { issueGrantForEmployee } from "@/lib/talent/identity";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message, retryable: status >= 500 } }, { status, headers });
const digest = (value: string) => createHash("sha256").update(value).digest();

function publicBase(): string {
  return (process.env.CELERATES_PUBLIC_URL ?? process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
}

export async function POST(request: NextRequest) {
  const secret = process.env.CONFORM_SERVICE_TOKEN ?? "";
  const base = publicBase();
  if (secret.length < 32 || !/^https?:\/\//.test(base)) return fail(503, "integration_unconfigured", "Integrasi belum dikonfigurasi.");
  const supplied = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(digest(supplied), digest(secret))) return fail(401, "unauthorized", "Token tidak valid.");
  const raw = await request.text();
  if (raw.length > 2048) return fail(413, "too_large", "Permintaan terlalu besar.");
  let employeeId = "";
  try {
    const body = JSON.parse(raw) as { employee_id?: unknown };
    employeeId = typeof body.employee_id === "string" ? body.employee_id.trim() : "";
  } catch {
    return fail(422, "invalid_json", "JSON tidak valid.");
  }
  if (!employeeId || employeeId.length > 120) return fail(422, "invalid_employee", "employee_id wajib diisi.");
  const grant = await issueGrantForEmployee(sql, { employeeId, targetPath: "/me", purpose: "whatsapp" });
  if (!grant) return fail(404, "no_account", "Talent belum punya akun Celerates yang aktif.");
  return NextResponse.json({ url: `${base}/go/${grant.code}`, expires_at: grant.expiresAt?.toISOString() ?? null }, { headers });
}
