import { db } from "@/db";
import { googleAccounts, googleTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createCipheriv, createDecipheriv, createSign, hkdfSync, randomBytes } from "node:crypto";

// ── Sales Sheet Sync credentials (QA 2026-10-08/09) ───────────────────────────────────────────────────────────
// Either a company Google account an Owner connected once (OAuth consent; refresh token encrypted in google_accounts),
// or, when GOOGLE_SERVICE_ACCOUNT_JSON is set, a service account. A sheet syncs once it is shared with that account
// as Editor. Tokens stay on the server; no Sales user signs in to Google.
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

export const SHEETS_PURPOSE = "sales_sheets";
export const SHEETS_SCOPES = "openid email https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly";

/** The OAuth client for connecting the company account, or null until its id and secret are on the server. */
export function sheetsOAuth() {
  const clientId = process.env.GOOGLE_SHEETS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_SHEETS_CLIENT_SECRET?.trim();
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  if (!clientId || !clientSecret || !base) return null;
  return {
    clientId, clientSecret,
    account: (process.env.GOOGLE_SHEETS_ACCOUNT ?? "celeratesapps@celerates.co.id").trim().toLowerCase(),
    redirectUri: `${base}/api/google/sheets/callback`,
  };
}

// The refresh token at rest: AES-256-GCM under a key derived from NEXTAUTH_SECRET for this use only (not the PII key,
// which stays behind the identity policy module). ponytail: rotating NEXTAUTH_SECRET means an Owner reconnects once.
const tokenKey = () => Buffer.from(hkdfSync("sha256", process.env.NEXTAUTH_SECRET ?? "", "celerates-erp", "google-accounts:v1", 32));
export function sealToken(plain: string, purpose: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", tokenKey(), iv).setAAD(Buffer.from(purpose));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `gt:v1:${Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64")}`;
}
export function openToken(sealed: string, purpose: string): string | null {
  if (!sealed.startsWith("gt:v1:") || !process.env.NEXTAUTH_SECRET) return null;
  try {
    const raw = Buffer.from(sealed.slice(6), "base64");
    const d = createDecipheriv("aes-256-gcm", tokenKey(), raw.subarray(0, 12)).setAAD(Buffer.from(purpose));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

async function connectedAccount() {
  const [row] = await db.select().from(googleAccounts).where(eq(googleAccounts.purpose, SHEETS_PURPOSE));
  return row ?? null;
}

/** The email a sheet must be shared with, or null when nothing is configured or connected. */
export async function sheetsAccountEmail(): Promise<string | null> {
  return serviceAccount()?.client_email ?? (await connectedAccount())?.email ?? null;
}

let cachedToken: { token: string; expiresAt: number } | null = null;
export const forgetSheetsToken = () => (cachedToken = null);

async function tokenRequest(body: Record<string, string>): Promise<{ access_token: string; expires_in: number }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!response.ok) throw new Error("Gagal mendapat akses Google. Minta Owner menghubungkan ulang akun Google di Google Sheet Sync.");
  return (await response.json()) as { access_token: string; expires_in: number };
}

/** Access token for the Sheets and Drive APIs, cached until near expiry. */
export async function getSheetsToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const sa = serviceAccount();
  let data: { access_token: string; expires_in: number };
  if (sa) {
    const now = Math.floor(Date.now() / 1000);
    const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({
      iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly",
      aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
    })}`;
    const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
    data = await tokenRequest({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` });
  } else {
    const oauth = sheetsOAuth();
    const row = await connectedAccount();
    const refreshToken = row ? openToken(row.refresh_token_enc, SHEETS_PURPOSE) : null;
    if (!oauth || !refreshToken) throw new Error("Google Sheet Sync belum dikonfigurasi: akun Google belum dihubungkan.");
    data = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: oauth.clientId, client_secret: oauth.clientSecret });
  }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

async function googleGet<T>(token: string, url: string, what: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`Gagal ${what} (${response.status}).`);
  return (await response.json()) as T;
}

/** Spreadsheets the account can open (shared with it or its own), newest first. */
export async function listSpreadsheets(token: string): Promise<{ id: string; name: string; url: string }[]> {
  const q = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const data = await googleGet<{ files?: { id: string; name: string; webViewLink?: string }[] }>(token,
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime%20desc&pageSize=100&fields=files(id,name,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    "membaca daftar Google Sheet");
  return (data.files ?? []).map((f) => ({ id: f.id, name: f.name, url: f.webViewLink ?? `https://docs.google.com/spreadsheets/d/${f.id}/edit` }));
}

/** The tab names of one spreadsheet. */
export async function listSheetTabs(token: string, spreadsheetId: string): Promise<string[]> {
  const data = await googleGet<{ sheets?: { properties: { title: string } }[] }>(token,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`, "membaca tab Google Sheet");
  return (data.sheets ?? []).map((s) => s.properties.title);
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