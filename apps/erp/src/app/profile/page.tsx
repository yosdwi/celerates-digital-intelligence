import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ProfileForm } from "./profile-form";
import { SessionsPanel } from "./sessions-panel";
import { sql } from "@/db";
import { listSessions, listTrustedBrowsers } from "@/lib/security/session";
import { listPasskeys } from "@/lib/security/passkey";
import { PasskeysPanel } from "./passkeys-panel";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  const [user] = await db.select().from(users).where(eq(users.email, session.user.email as string));
  if (!user) redirect("/login");
  const [sessions, browsers, passkeys] = await Promise.all([listSessions(sql, user.id), listTrustedBrowsers(sql, user.id), listPasskeys(sql, user.id)]);
  const iso = (d: Date | string) => new Date(d).toISOString();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white px-8 py-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-500">Akun Saya</p>
        <h1 className="text-2xl font-semibold text-slate-900 mt-0.5">Edit Profile</h1>
      </header>

      <main className="px-8 py-8 max-w-lg mx-auto">
        <ProfileForm user={{ full_name: user.full_name, role_title: user.role_title, email: user.email, hasPassword: !!user.password_hash }} />
        <PasskeysPanel passkeys={passkeys.map((p) => ({ id: p.id, label: p.label, created_at: iso(p.created_at), last_used_at: p.last_used_at ? iso(p.last_used_at) : null }))} />
        <SessionsPanel
          currentSid={(session.user as { sid?: string }).sid ?? null}
          sessions={sessions.map((s) => ({ ...s, created_at: iso(s.created_at), last_seen_at: iso(s.last_seen_at) }))}
          browsers={browsers.map((b) => ({ id: b.id, device: b.device, created_at: iso(b.created_at), expires_at: iso(b.expires_at) }))}
        />
      </main>
    </div>
  );
}