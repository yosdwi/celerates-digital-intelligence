import { db } from "@/db";
import { activityLogs, userAccess, divisions } from "@/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ExpandableSection } from "@/components/expandable-section";
import { ActivityLogTable, ActivityLogRow } from "./activity-log-table";
import { MODULES } from "@/lib/modules-config";
import { History } from "lucide-react";

function divisionLabel(key: string): string {
  return MODULES.find((m) => m.key === key)?.label ?? key;
}

export default async function ActivityLogPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const isOwner = Boolean((session.user as any).isOwner);
  const userId = (session.user as any).id as string;

  // Task Board & TTD Online terbuka buat semua user (nggak digerbang per-divisi),
  // jadi log activity-nya juga selalu kelihatan buat semua orang.
  const OPEN_DIVISION_KEYS = ["tasks", "ttd"];

  let allowedDivisionKeys: string[] | null = null; // null = semua (Owner)
  if (!isOwner) {
    const access = await db
      .select({ key: divisions.key })
      .from(userAccess)
      .innerJoin(divisions, eq(userAccess.division_id, divisions.id))
      .where(eq(userAccess.user_id, userId));
    allowedDivisionKeys = Array.from(new Set([...access.map((a) => a.key), ...OPEN_DIVISION_KEYS]));
  }

  const rows = allowedDivisionKeys
    ? (allowedDivisionKeys.length > 0
        ? await db.select().from(activityLogs).where(inArray(activityLogs.division_key, allowedDivisionKeys)).orderBy(desc(activityLogs.created_at)).limit(500)
        : [])
    : await db.select().from(activityLogs).orderBy(desc(activityLogs.created_at)).limit(500);

  const data: ActivityLogRow[] = rows.map((r) => ({
    id: r.id,
    division_label: divisionLabel(r.division_key),
    action_type: r.action_type,
    entity_label: r.entity_label,
    page_label: r.page_label,
    actor_name: r.actor_name,
    created_at: r.created_at.toISOString(),
  }));

  const divisionOptions = Array.from(new Set(data.map((d) => d.division_label))).sort();

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={History}
        color="bg-slate-700"
        eyebrow={isOwner ? "Owner" : "Divisi Saya"}
        title="Log Activity"
        subtitle={isOwner ? "Semua perubahan di seluruh modul ERP." : "Perubahan yang terjadi di divisi Anda."}
      />

      <main className="px-8 py-8 max-w-7xl mx-auto">
        <ExpandableSection title={`Riwayat Aktivitas (${data.length})`}>
          <ActivityLogTable data={data} divisionOptions={divisionOptions} />
        </ExpandableSection>
      </main>
    </div>
  );
}
