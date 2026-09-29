import { CheckCircle2 } from "lucide-react";

export type SalaryPeriod = {
  id: string;
  clientName: string | null;
  positionName: string | null;
  startDate: string | null;
  endDate: string | null;
  statusCode: string | null;
  basicSalary: number | null;
  functionalAllowance: number | null;
  transportAllowance: number | null;
  projectAllowance: number | null;
  accommodationAllowance: number | null;
  fieldAllowance: number | null;
  overtimeAllowance: number | null;
  priceAmount: number | null;
};

function rp(n: number | null): string {
  return n ? `Rp ${n.toLocaleString("id-ID")}` : "-";
}

function formatDdMmYyyy(dateStr: string | null): string {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}-${m}-${y}`;
}

function grossOf(p: SalaryPeriod): number {
  return (p.basicSalary ?? 0) + (p.functionalAllowance ?? 0) + (p.transportAllowance ?? 0) +
    (p.projectAllowance ?? 0) + (p.accommodationAllowance ?? 0) + (p.fieldAllowance ?? 0) + (p.overtimeAllowance ?? 0);
}

/**
 * Riwayat salary per periode assignment (Talents Book), current di-flag beda
 * warna dari history -- dipakai bareng di HR (Employee detail), TA (Candidate
 * detail), dan TM Talent Database & Salary supaya konsisten.
 */
export function SalaryHistory({ periods, title = "Riwayat Salary (Talents Book)" }: { periods: SalaryPeriod[]; title?: string }) {
  const sorted = [...periods].sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">Hijau = periode/salary yang berlaku saat ini (status &ldquo;On Project&rdquo;), sisanya riwayat.</p>
      </div>
      <div className="divide-y divide-slate-100">
        {sorted.map((p) => {
          const isCurrent = p.statusCode === "on_project";
          const gross = grossOf(p);
          return (
            <div key={p.id} className={`px-6 py-4 ${isCurrent ? "bg-emerald-50/70" : ""}`}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {isCurrent && (
                  <span className="inline-flex items-center gap-1 rounded-full whitespace-nowrap bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                    <CheckCircle2 className="h-3 w-3" /> SAAT INI
                  </span>
                )}
                <p className="font-medium text-slate-900">{p.clientName ?? "-"} {p.positionName ? `— ${p.positionName}` : ""}</p>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                Periode: {formatDdMmYyyy(p.startDate)} s/d {p.endDate ? formatDdMmYyyy(p.endDate) : "sekarang"}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <SalaryItem label="Basic Salary" value={rp(p.basicSalary)} />
                <SalaryItem label="Gross Salary" value={rp(gross)} strong />
                <SalaryItem label="Price" value={rp(p.priceAmount)} />
                <SalaryItem label="Status" value={p.statusCode ?? "-"} />
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="px-6 py-10 text-center text-slate-400 text-sm">Belum ada data salary dari Talents Book.</p>
        )}
      </div>
    </section>
  );
}

function SalaryItem({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-slate-400">{label}</p>
      <p className={`mt-0.5 ${strong ? "font-semibold text-slate-900" : "text-slate-700"}`}>{value}</p>
    </div>
  );
}
