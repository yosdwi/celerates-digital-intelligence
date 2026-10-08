import { db } from "@/db";
import { googleTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSign } from "node:crypto";

// ── Server service account (Sales Sheet Sync, QA 2026-10-08) ────────────────────────────────────────────────
// GOOGLE_SERVICE_ACCOUNT_JSON holds the service account's JSON key, as JSON or base64 (server env only, never sent to
// the browser). A sheet syncs once it is shared with the account's email as Editor; no user signs in to Google.
type ServiceAccount = { client_email: string; private_key: string };
function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const key = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as Partial<ServiceAccount>;
    return key.client_email && key.private_key ? { client_email: key.client_email, private_key: key.private_key } : null;
  } catch {
    return null;
  }
}

/** The email a sheet must be shared with, or null when no service account is configured. */
export const serviceAccountEmail = () => serviceAccount()?.client_email ?? null;

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Access token for the Sheets API from the service account (OAuth 2.0 JWT bearer grant), cached until near expiry. */
export async function getServiceAccountToken(): Promise<string> {
  const sa = serviceAccount();
  if (!sa) throw new Error("Google Sheet Sync belum dikonfigurasi: service account Google belum dipasang di server.");
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!response.ok) throw new Error("Gagal mendapat akses Google dari service account. Cek kunci service account di server.");
  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

export async function getValidAccessToken(userId: string): Promise<string> {
  const [token] = await db.select().from(googleTokens).where(eq(googleTokens.user_id, userId));
  if (!token) throw new Error("Belum pernah login Google dengan izin akses Sheets. Silakan logout lalu login lagi.");

  const isExpired = token.expires_at.getTime() < Date.now() + 60_000;
  if (!isExpired) return token.access_token;

  if (!token.refresh_token) {
    throw new Error("Token Google sudah habis dan tidak ada refresh token. Silakan logout lalu login lagi.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Gagal refresh token Google. Silakan logout lalu login lagi.");
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  const newAccessToken = data.access_token;
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);

  await db.update(googleTokens).set({
    access_token: newAccessToken,
    expires_at: newExpiresAt,
    updated_at: new Date(),
  }).where(eq(googleTokens.user_id, userId));

  return newAccessToken;
}

export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/**
 * Nama sheet yang ada spasi/karakter khusus (misal "Lead Intake") harus
 * dibungkus tanda kutip satu di format range Google Sheets API.
 */
export function quoteSheetName(name: string): string {
    return `'${name.replace(/'/g, "''")}'`;
  }

export async function readSheetValues(accessToken: string, spreadsheetId: string, range: string): Promise<string[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gagal baca Google Sheet: ${err}`);
  }
  const data = await response.json() as { values?: string[][] };
  return data.values ?? [];
}

export async function writeSheetValues(accessToken: string, spreadsheetId: string, range: string, values: string[][]): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gagal tulis ke Google Sheet: ${err}`);
  }
}

export async function clearSheetRange(accessToken: string, spreadsheetId: string, range: string): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gagal bersihkan Google Sheet: ${err}`);
  }
}