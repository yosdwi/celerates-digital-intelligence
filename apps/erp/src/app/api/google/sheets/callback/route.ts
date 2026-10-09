// Google's answer to ./connect. Only the configured company account is accepted; its refresh token is stored
// sealed (lib/google-sheets sealToken) and never returned. Every connection is in the sensitive access log.
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/db";
import { requestMeta, requireOwner } from "@/lib/actor";
import { audit } from "@/lib/security/audit";
import { forgetSheetsToken, sealToken, SHEETS_PURPOSE, SHEETS_SCOPES, sheetsOAuth } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";

function back(path: string, outcome: string) {
  const res = NextResponse.redirect(new URL(`${path}${path.includes("?") ? "&" : "?"}sheet=${outcome}`, process.env.NEXTAUTH_URL), 303);
  res.cookies.set("gsheets_oauth", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/google/sheets", maxAge: 0 });
  return res;
}

/** The email in Google's id_token. Received straight from Google's token endpoint over TLS (OIDC Core 3.1.3.7). */
function idTokenEmail(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  try {
    const claims = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string; email_verified?: boolean };
    return claims.email && claims.email_verified ? claims.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  let owner;
  try { owner = await requireOwner(); } catch { return new Response("Hanya Owner yang dapat menghubungkan akun Google.", { status: 403 }); }
  const oauth = sheetsOAuth();
  if (!oauth) return new Response("OAuth Google untuk Sheet Sync belum dipasang di server.", { status: 503 });
  let saved: { state?: string; back?: string } = {};
  try { saved = JSON.parse(req.cookies.get("gsheets_oauth")?.value ?? "{}"); } catch { /* treated as missing */ }
  const path = saved.back ?? "/sales/v2/opportunity-tracker";
  const q = req.nextUrl.searchParams;
  if (!saved.state || q.get("state") !== saved.state) return back(path, "state");
  if (q.get("error") || !q.get("code")) return back(path, "cancelled");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: q.get("code")!, client_id: oauth.clientId, client_secret: oauth.clientSecret, redirect_uri: oauth.redirectUri, grant_type: "authorization_code" }),
  }).catch(() => null);
  const data = (await response?.json().catch(() => null)) as { refresh_token?: string; id_token?: string; scope?: string } | null;
  const email = idTokenEmail(data?.id_token);
  const meta = await requestMeta();
  if (!response?.ok || !data?.refresh_token || !email) return back(path, "failed");
  const granted = new Set((data.scope ?? "").split(" "));
  if (email !== oauth.account) {
    await audit(sql, { action: "google_account_connect", decision: "deny", actorUserId: owner.id, sessionId: (owner as { sid?: string }).sid ?? null, reason: "wrong_account", ...meta });
    return back(path, "wrong-account");
  }
  if (!SHEETS_SCOPES.split(" ").filter((s) => s.startsWith("https://")).every((s) => granted.has(s))) return back(path, "scopes");

  await sql`INSERT INTO google_accounts (purpose, email, refresh_token_enc, scopes, connected_by_user_id)
    VALUES (${SHEETS_PURPOSE}, ${email}, ${sealToken(data.refresh_token, SHEETS_PURPOSE)}, ${data.scope ?? ""}, ${owner.id})
    ON CONFLICT (purpose) DO UPDATE SET email = EXCLUDED.email, refresh_token_enc = EXCLUDED.refresh_token_enc,
      scopes = EXCLUDED.scopes, connected_by_user_id = EXCLUDED.connected_by_user_id, connected_at = now()`;
  forgetSheetsToken();
  await audit(sql, { action: "google_account_connect", decision: "allow", actorUserId: owner.id, sessionId: (owner as { sid?: string }).sid ?? null, reason: SHEETS_PURPOSE, ...meta });
  return back(path, "connected");
}
