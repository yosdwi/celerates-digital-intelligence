export type TimelineEvent = {
  id: string;
  date: string | null;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  colorClass?: string;
};

export function Timeline({ events }: { events: TimelineEvent[] }) {
  const sorted = [...events].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  if (sorted.length === 0) {
    return <p className="text-sm text-slate-400 py-10 text-center">Belum ada riwayat.</p>;
  }

  return (
    <ol className="relative ml-3 border-l-2 border-slate-100">
      {sorted.map((e) => (
        <li key={e.id} className="relative mb-8 last:mb-0 ml-6">
          <span className={`absolute -left-[29px] top-1 h-4 w-4 rounded-full border-2 border-white shadow ${e.colorClass ?? "bg-brand-500"}`} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-900">{e.title}</p>
            {e.badge}
          </div>
          {e.subtitle && <p className="text-xs text-slate-500 mt-0.5">{e.subtitle}</p>}
          <p className="text-xs text-slate-400 mt-1">{e.date ?? "Tanggal tidak diketahui"}</p>
        </li>
      ))}
    </ol>
  );
}
