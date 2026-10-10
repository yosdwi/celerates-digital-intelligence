// Who has a page open (QA doc page 23, Attio's avatars in the header). Each open tab posts its path every 20 s; the
// answer is everyone seen on that path in the last 45 s. Names only, to signed-in people.
// ponytail: kept in this process's memory, which is right while the ERP runs as one container; move to Postgres or
// Redis if it ever runs several replicas.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
const FRESH_MS = 45_000;
const MAX_PATHS = 2_000;
type Seen = Map<string, { name: string; at: number }>;
const store = ((globalThis as { __erpPresence?: Map<string, Seen> }).__erpPresence ??= new Map<string, Seen>());

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; fullName?: string; name?: string; email?: string } | undefined;
  if (!user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { path?: unknown };
  const path = typeof body.path === "string" ? body.path.slice(0, 300) : "";
  if (!path.startsWith("/")) return NextResponse.json({ error: "bad path" }, { status: 400 });

  const now = Date.now();
  if (!store.has(path) && store.size >= MAX_PATHS) {
    for (const [key, seen] of store) {
      for (const [id, v] of seen) if (now - v.at > FRESH_MS) seen.delete(id);
      if (!seen.size) store.delete(key);
    }
  }
  const seen = store.get(path) ?? new Map();
  store.set(path, seen);
  seen.set(user.id, { name: user.fullName ?? user.name ?? user.email ?? "?", at: now });
  const viewers = [...seen]
    .filter(([id, v]) => (now - v.at <= FRESH_MS ? true : (seen.delete(id), false)))
    .sort(([, a], [, b]) => b.at - a.at)
    .map(([id, v]) => ({ id, name: v.name, self: id === user.id }));
  return NextResponse.json({ viewers }, { headers: { "Cache-Control": "private, no-store" } });
}
