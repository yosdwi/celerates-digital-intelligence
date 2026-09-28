import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// ADR-019 §4: an active Talent session may reach only its own surfaces. Everything else stays Owner-only (pilot).
const TALENT_PATHS = [/^\/me(\/|$)/, /^\/api\/talent\//, /^\/go\//];

type Flag = "x-erp-protected" | "x-erp-talent" | "x-erp-link";
function pass(req: NextRequest, ...set: (Flag | undefined)[]) {
  const headers = new Headers(req.headers);
  headers.delete("x-erp-protected");
  headers.delete("x-erp-talent");
  headers.delete("x-erp-link");
  for (const flag of set) if (flag) headers.set(flag, "1");
  return NextResponse.next({ request: { headers } });
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (["/login", "/setup", "/api/setup", "/api/health/live", "/api/health/ready", "/logo-celerates.jpg", "/manifest.webmanifest", "/sw.js", "/offline.html"].includes(path) || path.startsWith("/api/auth/") || /^\/icons\/[a-z0-9-]+\.png$/.test(path)) return pass(req);
  // Only the versioned machine contract delegates to its own fail-closed auth.
  if (path.startsWith("/api/integration/v1/")) return pass(req);
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const talent = token?.status === "active" && token.accountType === "talent" && token.isOwner !== true;
  // A deep link opens with or without a session; the page decides (same user continues, another user fails closed).
  // It always renders in the bare frame: no backoffice widget may start calling Owner-only actions after sign-in.
  if (/^\/go\/[A-Za-z0-9_-]{1,80}$/.test(path)) return pass(req, "x-erp-link", talent ? "x-erp-talent" : token?.isOwner === true && token.status === "active" ? "x-erp-protected" : undefined);
  if (talent) {
    if (TALENT_PATHS.some((p) => p.test(path))) return pass(req, "x-erp-talent");
    if (path.startsWith("/api/")) return new NextResponse("Forbidden", { status: 403 });
    // Not a server redirect: Next normalizes same-origin Locations onto its bind host, which would drop the session.
    // A same-origin meta refresh keeps the Talent on the origin their session belongs to.
    return new NextResponse('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/me"><a href="/me">Kelengkapan Saya</a>', { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (!token || token.status !== "active" || token.isOwner !== true) {
    if (path.startsWith("/api/")) return new NextResponse("Unauthorized", { status: 403 });
    return NextResponse.redirect(new URL("/login?error=AccessDenied", req.url));
  }
  return pass(req, "x-erp-protected");
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|logo-white.png).*)"] };
