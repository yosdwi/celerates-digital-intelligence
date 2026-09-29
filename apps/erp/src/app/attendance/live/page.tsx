import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { attendanceLogs } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Fingerprint, MapPin } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/pill";
import { CheckInOutButton } from "./check-in-out-button";

function formatTime(d: Date | null): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(d);
}

export default async function LiveAttendancePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const userId = (session.user as any).id as string;
  const workDate = new Date().toISOString().slice(0, 10);

  const todaySessions = await db
    .select()
    .from(attendanceLogs)
    .where(and(eq(attendanceLogs.user_id, userId), eq(attendanceLogs.work_date, workDate)))
    .orderBy(desc(attendanceLogs.check_in_at));

  return (
    <div className="min-h-screen">
      <PageHeader icon={Fingerprint} color="bg-rose-500" eyebrow="Attendance" title="Live Attendance">
        <Link href="/attendance" className="text-sm font-medium text-brand-600 hover:underline">&larr; Kembali</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-md mx-auto space-y-4">
        <div className="rounded-2xl border border-white/70 bg-white/78 backdrop-blur-xl p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_24px_-14px_rgba(15,23,42,0.12)] space-y-5">
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-2">Check In</p>
            <CheckInOutButton mode="in" />
          </div>
          <div className="border-t border-slate-100 pt-5">
            <p className="text-sm font-semibold text-slate-800 mb-2">Check Out</p>
            <CheckInOutButton mode="out" />
          </div>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/78 backdrop-blur-xl p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_24px_-14px_rgba(15,23,42,0.12)]">
          <p className="text-sm font-semibold text-slate-800 mb-3">Sesi Hari Ini</p>
          {todaySessions.length === 0 ? (
            <p className="text-xs text-slate-400">Belum ada sesi hari ini.</p>
          ) : (
            <div className="space-y-2">
              {todaySessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <span className="text-slate-600">{formatTime(s.check_in_at)} - {formatTime(s.check_out_at)}</span>
                  <div className="flex items-center gap-2">
                    {(s.check_in_lat != null || s.check_out_lat != null) && <MapPin className="h-3 w-3 text-slate-400" />}
                    {s.check_out_at ? <Pill variant="success">Selesai</Pill> : <Pill variant="info">Berlangsung</Pill>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Link
          href="/attendance/history"
          className="block text-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Lihat Attendance Log
        </Link>
      </main>
    </div>
  );
}
