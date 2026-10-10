// An Owner connects the company Google account for Sales Sheet Sync (QA 2026-10-09): Google's consent page, then
// ../callback. The state is a one-time value in a short-lived cookie bound to this browser.
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/actor";
import { SHEETS_SCOPES, sheetsOAuth } from "@/lib/google-sheets";
import { safeSalesReturnPath } from "@/lib/safe-return";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireOwner(); } catch { return new Response("Hanya Owner yang dapat menghubungkan akun Google.", { status: 403 }); }
  const oauth = sheetsOAuth();
  if (!oauth) return new Response("OAuth Google untuk Sheet Sync belum dipasang di server.", { status: 503 });
  const state = randomBytes(24).toString("base64url");
  const back = safeSalesReturnPath(req.nextUrl.searchParams.get("back"), "/sales/v2/opportunity-tracker");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: oauth.clientId, redirect_uri: oauth.redirectUri, response_type: "code", scope: SHEETS_SCOPES,
    access_type: "offline", prompt: "consent", include_granted_scopes: "false", login_hint: oauth.account, state,
  }).toString();
  const res = NextResponse.redirect(url, 303);
  res.cookies.set("gsheets_oauth", JSON.stringify({ state, back }), { httpOnly: true, secure: true, sameSite: "lax", path: "/api/google/sheets", maxAge: 600 });
  return res;
}
