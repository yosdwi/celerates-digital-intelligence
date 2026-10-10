import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { canOpenRoute, type RouteClaims } from "@/lib/route-access";

// ADR-019 §4: an active Talent session may reach only its own surfaces. Backoffice pages follow the division RBAC
// (doc 22 §2.1): route-level module gate here (route-access.ts), record and action authority in the server code.
const TALENT_PATHS = [/^\/me(\/|$)/, /^\/api\/talent\//, /^\/go\//, /^\/api\/identity-documents(\/|$)/];

type Flag = "x-erp-protected" | "x-erp-talent" | "x-erp-link" | "x-erp-bare";
function pass(req: NextRequest, ...set: (Flag | undefined)[]) {
  const headers = new Headers(req.headers);
  headers.delete("x-erp-protected");
  headers.delete("x-erp-talent");
  headers.delete("x-erp-link");
  headers.delete("x-erp-bare");
  for (const flag of set) if (flag) headers.set(flag, "1");
  return NextResponse.next({ request: { headers } });
}
// Not a server redirect: Next normalizes same-origin Locations onto its bind host, which would drop the session.
// A same-origin meta refresh keeps a signed-in user on the origin their session belongs to.
// A Server Action POST (the `next-action` header) can't follow a meta refresh -- it's an XHR, not a navigation --
// so the 403 HTML body above just surfaces as an opaque "403 Forbidden" in whatever UI triggered the action. Next's
// action runtime *does* natively follow a redirect Response, so give those requests one instead of the HTML trick.
function refresh(req: NextRequest, to: string, label: string) {
  if (req.headers.has("next-action")) return NextResponse.redirect(new URL(to, req.url), 303);
  return new NextResponse(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${to}"><a href="${to}">${label}</a>`, { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
const SESSION_COOKIES = ["__Secure-next-auth.session-token", "next-auth.session-token"];

// docs/security/02: the cookie only names a session; PostgreSQL decides. This (Edge) middleware asks the Node route
// /api/session-check on loopback for the live session's claims. Any failure fails closed (no claims).
type LiveClaims = RouteClaims & { accountType: string; isOwner: boolean };
// A network failure is retried once; a refusal is not. Either way it is logged (status only, never the cookie), so a
// sign-out nobody asked for can be traced.
async function liveClaims(req: NextRequest): Promise<LiveClaims | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/session-check`, { headers: { cookie: req.headers.get("cookie") ?? "" }, cache: "no-store" });
      if (res.ok) return (await res.json()) as LiveClaims;
      console.warn(`[session] check refused status=${res.status}`);
      return null;
    } catch (error) {
      console.warn(`[session] check unreachable attempt=${attempt}`, (error as Error).name);
    }
  }
  return null;
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // The sign-in page never sits inside the app frame, and a signed-in browser has no business on it.
  if (path === "/login") {
    const signedIn = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET })) ? await liveClaims(req) : null;
    if (signedIn) return refresh(req, signedIn.accountType === "talent" && !signedIn.isOwner ? "/me" : "/", "Beranda");
    return pass(req, "x-erp-bare");
  }
  if (["/api/login", "/api/passkey/login/options", "/api/session-check", "/setup", "/api/setup", "/api/health/live", "/api/health/ready", "/logo-celerates.jpg", "/manifest.webmanifest", "/sw.js", "/offline.html"].includes(path) || path.startsWith("/api/auth/") || /^\/icons\/[a-z0-9-]+\.png$/.test(path)) return pass(req);
  // Only the versioned machine contract delegates to its own fail-closed auth.
  if (path.startsWith("/api/integration/v1/")) return pass(req);
  // Machine-to-machine endpoints (ConForm → Celerates) authenticate themselves with a service bearer token.
  if (path.startsWith("/api/internal/")) return pass(req);
  // Cookie contents are never trusted for authority: only a live session row (not revoked, not expired, user active).
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const claims = token ? await liveClaims(req) : null;
  const talent = !!claims && claims.accountType === "talent" && !claims.isOwner;
  const backoffice = !!claims && !talent;
  // A deep link opens with or without a session; the page decides (same user continues, another user fails closed).
  // It always renders in the bare frame: no backoffice widget may start calling Owner-only actions after sign-in.
  if (/^\/go\/[A-Za-z0-9_-]{1,80}$/.test(path)) return pass(req, "x-erp-link", talent ? "x-erp-talent" : backoffice ? "x-erp-protected" : undefined);
  if (talent) {
    if (TALENT_PATHS.some((p) => p.test(path))) return pass(req, "x-erp-talent");
    if (path.startsWith("/api/")) return new NextResponse("Forbidden", { status: 403 });
    return refresh(req, "/me", "Kelengkapan Saya");
  }
  if (!claims) {
    const res = path.startsWith("/api/") ? new NextResponse("Unauthorized", { status: 403 }) : NextResponse.redirect(new URL(token ? "/login?expired=1" : "/login", req.url));
    // A cookie whose session is gone is dropped, so the browser stops presenting it.
    if (token) for (const name of SESSION_COOKIES) res.cookies.set(name, "", { maxAge: 0, path: "/", secure: name.startsWith("__Secure-"), httpOnly: true, sameSite: "lax" });
    return res;
  }
  // Route-level module gate. APIs and server actions check their own authority; a module page the user has no
  // division for is refused here, before any page code runs.
  if (!path.startsWith("/api/") && !canOpenRoute(claims, path)) return refresh(req, "/", "Beranda");
  return pass(req, "x-erp-protected");
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|logo-white.png).*)"] };
