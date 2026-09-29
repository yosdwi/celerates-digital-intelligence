import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { canOpenRoute, type RouteClaims } from "@/lib/route-access";

// ADR-019 §4: an active Talent session may reach only its own surfaces. Backoffice pages follow the division RBAC
// (doc 22 §2.1): route-level module gate here (route-access.ts), record and action authority in the server code.
const TALENT_PATHS = [/^\/me(\/|$)/, /^\/api\/talent\//, /^\/go\//];

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
function refresh(to: string, label: string) {
  return new NextResponse(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${to}"><a href="${to}">${label}</a>`, { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
// Signed in but not (yet) active: only the request-access and waiting pages, rendered bare.
const WAITING_PATHS = ["/pending-approval", "/onboarding-profile"];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (["/login", "/setup", "/api/setup", "/api/health/live", "/api/health/ready", "/logo-celerates.jpg", "/manifest.webmanifest", "/sw.js", "/offline.html"].includes(path) || path.startsWith("/api/auth/") || /^\/icons\/[a-z0-9-]+\.png$/.test(path)) return pass(req);
  // Only the versioned machine contract delegates to its own fail-closed auth.
  if (path.startsWith("/api/integration/v1/")) return pass(req);
  // Machine-to-machine endpoints (ConForm → Celerates) authenticate themselves with a service bearer token.
  if (path.startsWith("/api/internal/")) return pass(req);
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const talent = token?.status === "active" && token.accountType === "talent" && token.isOwner !== true;
  const backoffice = token?.status === "active" && !talent;
  // A deep link opens with or without a session; the page decides (same user continues, another user fails closed).
  // It always renders in the bare frame: no backoffice widget may start calling Owner-only actions after sign-in.
  if (/^\/go\/[A-Za-z0-9_-]{1,80}$/.test(path)) return pass(req, "x-erp-link", talent ? "x-erp-talent" : backoffice ? "x-erp-protected" : undefined);
  if (talent) {
    if (TALENT_PATHS.some((p) => p.test(path))) return pass(req, "x-erp-talent");
    if (path.startsWith("/api/")) return new NextResponse("Forbidden", { status: 403 });
    return refresh("/me", "Kelengkapan Saya");
  }
  // A backoffice account waiting for approval (or rejected) sees the request-access / waiting pages only.
  if (token && (token.status === "pending" || token.status === "rejected") && token.accountType !== "talent") {
    if (WAITING_PATHS.includes(path)) return pass(req, "x-erp-bare");
    if (path.startsWith("/api/")) return new NextResponse("Unauthorized", { status: 403 });
    const to = token.status === "pending" && token.hasRequestedDivision !== true ? "/onboarding-profile" : "/pending-approval";
    return refresh(to, "Status akun");
  }
  if (!token || !backoffice) {
    if (path.startsWith("/api/")) return new NextResponse("Unauthorized", { status: 403 });
    return NextResponse.redirect(new URL("/login?error=AccessDenied", req.url));
  }
  // Route-level module gate. APIs and server actions check their own authority; a module page the user has no
  // division for is refused here, before any page code runs.
  if (!path.startsWith("/api/") && !canOpenRoute(token as RouteClaims, path)) return refresh("/", "Beranda");
  return pass(req, "x-erp-protected");
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|logo-white.png).*)"] };
