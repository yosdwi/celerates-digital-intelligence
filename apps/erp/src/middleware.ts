import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (["/login", "/setup", "/api/setup", "/api/health/live", "/api/health/ready", "/logo-celerates.jpg"].includes(path) || path.startsWith("/api/auth/")) { const headers = new Headers(req.headers); headers.delete("x-erp-protected"); return NextResponse.next({ request: { headers } }); }
  // Only the versioned machine contract delegates to its own fail-closed auth.
  if (path.startsWith("/api/integration/v1/")) { const headers = new Headers(req.headers); headers.delete("x-erp-protected"); return NextResponse.next({ request: { headers } }); }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || token.status !== "active" || token.isOwner !== true) {
    if (path.startsWith("/api/")) return new NextResponse("Unauthorized", { status: 403 });
    return NextResponse.redirect(new URL("/login?error=AccessDenied", req.url));
  }
  const headers = new Headers(req.headers); headers.set("x-erp-protected", "1");
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|logo-white.png).*)"] };
