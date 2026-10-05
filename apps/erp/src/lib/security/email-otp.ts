// One verification primitive for new-browser login, step-up, invite/first login and password reset
// (docs/security/02). A 6-digit code from the CSPRNG, stored only as an HMAC bound to user and purpose, valid 10
// minutes, single use, 5 wrong guesses per code, superseded by a newer code. Codes are never logged.
import { createHmac, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import nodemailer from "nodemailer";
import type { Sql, TransactionSql } from "postgres";

type Tx = Sql | TransactionSql;
export type OtpPurpose = "login" | "step_up" | "reset";
export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_MAX_FAILS = 5;

function codeHmac(userId: string, purpose: OtpPurpose, code: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("NEXTAUTH_SECRET is required for verification codes");
  return createHmac("sha256", secret).update(`otp:v1:${userId}:${purpose}:${code}`).digest("hex");
}

export async function issueChallenge(
  sql: Tx,
  input: { userId: string; purpose: OtpPurpose; sessionId?: string | null; delivery?: "email" | "break_glass" },
): Promise<{ id: string; code: string }> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const sessionId = input.purpose === "step_up" ? input.sessionId ?? null : null;
  if (input.purpose === "step_up" && !sessionId) throw new Error("step-up code needs a session");
  // A newer code supersedes older ones. An emailed code never cancels an operator-issued break-glass code (mail may
  // be exactly what is broken); a break-glass code supersedes everything.
  await sql`UPDATE auth_email_challenges SET consumed_at = now()
    WHERE user_id = ${input.userId} AND purpose = ${input.purpose} AND consumed_at IS NULL
      AND (${input.delivery ?? "email"} = 'break_glass' OR delivery = 'email')`;
  const [row] = await sql`INSERT INTO auth_email_challenges (user_id, purpose, session_id, code_hmac, delivery, expires_at)
    VALUES (${input.userId}, ${input.purpose}, ${sessionId}, ${codeHmac(input.userId, input.purpose, code)}, ${input.delivery ?? "email"},
            now() + make_interval(secs => ${OTP_TTL_SECONDS})) RETURNING id`;
  return { id: row.id as string, code };
}

/** Consume a matching open code. A miss counts against every open code of this user and purpose. */
export async function verifyChallenge(
  sql: Tx,
  input: { userId: string; purpose: OtpPurpose; code: string; sessionId?: string | null },
): Promise<{ ok: true; delivery: "email" | "break_glass" } | { ok: false }> {
  const sessionId = input.purpose === "step_up" ? input.sessionId ?? null : null;
  const code = String(input.code ?? "").trim();
  if (/^\d{6}$/.test(code)) {
    const [hit] = await sql`UPDATE auth_email_challenges SET consumed_at = now()
      WHERE user_id = ${input.userId} AND purpose = ${input.purpose} AND session_id IS NOT DISTINCT FROM ${sessionId}::uuid
        AND code_hmac = ${codeHmac(input.userId, input.purpose, code)} AND consumed_at IS NULL AND expires_at > now()
        AND failed_attempts < ${OTP_MAX_FAILS}
      RETURNING delivery`;
    if (hit) return { ok: true, delivery: hit.delivery };
  }
  await sql`UPDATE auth_email_challenges SET failed_attempts = failed_attempts + 1
    WHERE user_id = ${input.userId} AND purpose = ${input.purpose} AND consumed_at IS NULL AND failed_attempts < ${OTP_MAX_FAILS}`;
  return { ok: false };
}

// ---- delivery ----

/** Corporate mailbox domains that may receive codes, plus explicit, audited per-address exceptions. */
export function mailboxAllowed(email: string): { ok: boolean; exception: boolean } {
  const lower = email.trim().toLowerCase();
  const domains = (process.env.AUTH_EMAIL_DOMAINS || "celerates.com,celerates.co.id").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  const exceptions = (process.env.AUTH_EMAIL_EXCEPTIONS || "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (domains.includes(lower.split("@")[1] ?? "")) return { ok: true, exception: false };
  return exceptions.includes(lower) ? { ok: true, exception: true } : { ok: false, exception: false };
}

/** Email codes are required unless explicitly switched off for the cutover (AUTH_EMAIL_OTP=off). */
export const emailOtpRequired = () => process.env.AUTH_EMAIL_OTP !== "off";

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_FROM && (process.env.SMTP_PASSWORD || process.env.SMTP_PASSWORD_FILE));
}

const SUBJECT: Record<OtpPurpose, string> = {
  login: "Kode masuk Celerates ERP",
  step_up: "Kode konfirmasi Celerates ERP",
  reset: "Kode atur password Celerates ERP",
};

async function smtpSend(to: string, code: string, purpose: OtpPurpose): Promise<void> {
  if (!mailConfigured()) throw new Error("mail_not_configured");
  const pass = process.env.SMTP_PASSWORD || readFileSync(process.env.SMTP_PASSWORD_FILE!, "utf8").trim();
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    // TLS is mandatory except to a loopback relay (local test harness); credentials never cross a network in clear.
    requireTLS: process.env.SMTP_HOST !== "127.0.0.1",
    auth: { user: process.env.SMTP_USER, pass },
    logger: false,
    connectionTimeout: 10_000,
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: SUBJECT[purpose],
    text: [
      `Kode Anda: ${code}`,
      "",
      "Berlaku 10 menit dan hanya sekali pakai. Jangan berikan kode ini kepada siapa pun, termasuk tim Celerates.",
      "Jika Anda tidak sedang masuk ke Celerates ERP, abaikan email ini dan beri tahu admin.",
    ].join("\n"),
  });
}

/** Replaceable in tests (a fake transport); production sends through SMTP. */
export const mail = { send: smtpSend };
