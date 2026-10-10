import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { claimsOf } from "@/lib/module-access";
import { MobileHome } from "@/components/mobile/mobile-home";
import { HomeDesktop } from "@/features/home/home-desktop";
import type { OperationalActor } from "@/lib/operations/policy";

// Beranda (QA doc pages 17–18, 2026-10-09): the sidebar already reaches every module, so the desktop Home is the
// person's day (greeting, the Agent box, what needs them) instead of a module picker. Phone keeps the mobile Beranda.
export default async function HomePage() {
  const session = await getServerSession(authOptions);
  const user = (session?.user ?? {}) as { id?: string; fullName?: string; name?: string; email?: string };
  const claims = claimsOf(session?.user);
  return (
    <>
      <div className="md:hidden">
        <MobileHome />
      </div>
      <div className="hidden min-h-full md:block">
        {user.id && (
          <HomeDesktop userId={user.id} actor={session?.user as OperationalActor} name={user.fullName ?? user.name ?? user.email ?? ""} isOwner={claims.isOwner === true}
            divisions={(claims.access ?? []).map((a) => a.divisionKey)} />
        )}
      </div>
    </>
  );
}
