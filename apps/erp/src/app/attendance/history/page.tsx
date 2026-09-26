import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { attendanceLogs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { ClipboardList, MapPin } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ExpandableSection } from "@/components/expandable-section";

function formatTime(d: Date | null): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(d);
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(dateStr + "T00:00:00"));
}

export default async function AttendanceHistoryPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const userId = (session.user as any).id as string;

  const rows = await db
    .select()
    .from(attendanceLogs)
    .where(eq(attendanceLogs.user_id, userId))
    .orderBy(desc(attendanceLogs.check_in_at))
    .limit(30);

  return (
    <div className="min-h-screen">
      <PageHeader icon={ClipboardList} color="bg-orange-500" eyebrow="Attendance" title="Attendance Log" subtitle="Riwayat absensi Anda 30 hari terakhir">
        <Link href="/attendance" className="text-sm font-medium text-brand-600 hover:underline">&larr; Kembali</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-4xl mx-auto">
        <ExpandableSection title={`Riwayat (${rows.length})`}>
          {rows.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-16">Belum ada riwayat absensi.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-200">
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3">Masuk</th>
                    <th className="px-4 py-3">Keluar</th>
                    <th className="px-4 py-3">Lokasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{formatDate(r.work_date)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatTime(r.check_in_at)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatTime(r.check_out_at)}</td>
                      <td className="px-4 py-3">
                        {(r.check_in_lat != null || r.check_out_lat != null) ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400"><MapPin className="h-3 w-3" /> Tercatat</span>
                        ) : (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ExpandableSection>
      </main>
    </div>
  );
}
