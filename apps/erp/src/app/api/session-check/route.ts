// Live session check for the middleware (docs/security/02). Middleware runs on the Edge runtime (Next 15.5's
// Node-runtime middleware corrupts large request bodies), so it cannot open PostgreSQL itself and asks this route
// over loopback. It answers only for the cookie presented: that session's own coarse claims, or 401.
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { sql } from "@/db";
import { loadSession } from "@/lib/security/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const claims = token ? await loadSession(sql, token.sid) : null;
  const headers = { "Cache-Control": "no-store" };
  if (!claims) return Response.json(null, { status: 401, headers });
  return Response.json({ accountType: claims.accountType, isOwner: claims.isOwner, access: claims.access }, { headers });
}
