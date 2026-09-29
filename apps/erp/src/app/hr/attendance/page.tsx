import { db } from "@/db";
import { attendanceLogs, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ExpandableSection } from "@/components/expandable-section";
import { Fingerprint } from "lucide-react";
import { AttendanceLogTable } from "./attendance-log-table";

export default async function HrAttendancePage() {
  const rows = await db
    .select({
      id: attendanceLogs.id,
      user_id: attendanceLogs.user_id,
      user_name: users.full_name,
      work_date: attendanceLogs.work_date,
      check_in_at: attendanceLogs.check_in_at,
      check_in_lat: attendanceLogs.check_in_lat,
      check_in_lng: attendanceLogs.check_in_lng,
      check_out_at: attendanceLogs.check_out_at,
      check_out_lat: attendanceLogs.check_out_lat,
      check_out_lng: attendanceLogs.check_out_lng,
    })
    .from(attendanceLogs)
    .leftJoin(users, eq(attendanceLogs.user_id, users.id))
    .orderBy(desc(attendanceLogs.work_date));

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = rows.filter((r) => r.work_date === today).length;
  const openCount = rows.filter((r) => !r.check_out_at).length;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Fingerprint}
        color="bg-teal-500"
        eyebrow="HR"
        title="Attendance Log"
        subtitle="Riwayat check-in/out semua karyawan (Talent & Backoffice)"
      />

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="Total Log" value={rows.length} color="navy" />
          <StatCard label="Absen Hari Ini" value={todayCount} color="green" />
          <StatCard label="Belum Check-out" value={openCount} color="amber" />
        </div>

        <ExpandableSection title={`Daftar Log (${rows.length})`}>
          <AttendanceLogTable data={rows} />
        </ExpandableSection>
      </main>
    </div>
  );
}
