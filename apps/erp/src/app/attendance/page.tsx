import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock, Fingerprint, ClipboardList, Receipt, Wallet, Calendar, Folder, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";

type Tile = { href: string; label: string; description: string; icon: React.ComponentType<{ className?: string }>; color: string; comingSoon?: boolean };

const TILES: Tile[] = [
  { href: "/attendance/live", label: "Live Attendance", description: "Check-in/out dengan selfie + lokasi", icon: Fingerprint, color: "bg-rose-500" },
  { href: "/attendance/history", label: "Attendance Log", description: "Riwayat absensi Anda", icon: ClipboardList, color: "bg-orange-500" },
  { href: "/attendance/time-off", label: "Time Off", description: "Ajukan & pantau cuti/izin", icon: Clock, color: "bg-indigo-500" },
  { href: "/attendance/reimbursement", label: "Reimbursement", description: "Segera hadir", icon: Receipt, color: "bg-sky-500", comingSoon: true },
  { href: "/attendance/payslip", label: "Payslip", description: "Segera hadir", icon: Wallet, color: "bg-blue-500", comingSoon: true },
  { href: "/attendance/calendar", label: "Calendar", description: "Segera hadir", icon: Calendar, color: "bg-pink-500", comingSoon: true },
  { href: "/attendance/files", label: "Files", description: "Segera hadir", icon: Folder, color: "bg-amber-500", comingSoon: true },
];

export default async function AttendanceHomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const firstName = ((session.user as any).fullName ?? session.user.name ?? "Sobat Celerates").split(" ")[0];
  const today = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date());

  return (
    <div className="min-h-screen">
      <PageHeader icon={Fingerprint} color="bg-teal-500" eyebrow="Attendance" title={`Halo, ${firstName}`} subtitle={today} />

      <main className="px-8 py-12 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TILES.map((tile) => {
            const Icon = tile.icon;

            if (tile.comingSoon) {
              return (
                <div key={tile.href} className="rounded-2xl border border-slate-200 bg-white/60 p-6 flex items-center gap-4 opacity-60">
                  <div className={`h-12 w-12 rounded-xl ${tile.color} flex items-center justify-center flex-shrink-0 opacity-70`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-700">{tile.label}</p>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Coming Soon</span>
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={tile.href}
                href={tile.href}
                className="group rounded-2xl border border-slate-200 bg-white p-6 flex items-center gap-4 transition-all duration-200 hover:shadow-lg hover:shadow-sky-500/10 hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50/50"
              >
                <div className={`h-12 w-12 rounded-xl ${tile.color} flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform duration-200`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{tile.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{tile.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-sky-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
