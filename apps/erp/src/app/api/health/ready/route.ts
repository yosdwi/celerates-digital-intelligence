import { sql } from "@/db";
import { checkStorage } from "@/lib/object-store";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await Promise.all([sql`SELECT name FROM erp_migrations ORDER BY name DESC LIMIT 1`, checkStorage()]);
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
