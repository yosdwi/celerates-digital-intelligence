// Warna kategorikal urutan tetap (jangan di-cycle) -- dipakai konsisten di semua
// dashboard modul supaya kategori yang sama selalu dapat warna yang sama.
// `bar` sekarang gradient CSS (bukan Tailwind class) biar lebih vivid --
// mengikuti arah desain "colorful modern SaaS", bukan indigo generik.
export const CHART_COLORS = [
  { bar: "linear-gradient(90deg, #7c3aed, #a78bfa)", stroke: "#7c3aed", text: "text-violet-700" },
  { bar: "linear-gradient(90deg, #2563eb, #60a5fa)", stroke: "#2563eb", text: "text-blue-700" },
  { bar: "linear-gradient(90deg, #db2777, #f472b6)", stroke: "#db2777", text: "text-pink-700" },
  { bar: "linear-gradient(90deg, #ea580c, #fb923c)", stroke: "#ea580c", text: "text-orange-700" },
  { bar: "linear-gradient(90deg, #059669, #34d399)", stroke: "#059669", text: "text-emerald-700" },
  { bar: "linear-gradient(90deg, #be123c, #fb7185)", stroke: "#be123c", text: "text-rose-700" },
  { bar: "linear-gradient(90deg, #b45309, #fbbf24)", stroke: "#b45309", text: "text-amber-700" },
  { bar: "linear-gradient(90deg, #64748b, #94a3b8)", stroke: "#64748b", text: "text-slate-600" },
];

export type ChartItem = { label: string; value: number };

// Kode yang sebenarnya singkatan/akronim -- harus SEMUA huruf besar, bukan cuma huruf pertama.
const ACRONYMS = new Set(["pkwt", "pkwtt", "bdcs", "pm", "sad", "das", "hr", "tm", "pmo", "ta", "cs", "cr", "po", "pq", "spk", "bast", "npwp", "ktp", "kk"]);

export function prettify(code: string | null): string {
  if (!code) return "Lainnya";
  return code
    .split("_")
    .map((word) => (ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

export function countBy<T>(rows: T[], keyFn: (row: T) => string | null): ChartItem[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = prettify(keyFn(row));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function withColors(items: ChartItem[]) {
  return items.map((item, i) => ({ ...item, color: CHART_COLORS[i % CHART_COLORS.length] }));
}

export function DashboardCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/72 backdrop-blur-xl p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-12px_rgba(15,23,42,0.10)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(15,23,42,0.05),0_20px_36px_-14px_rgba(15,23,42,0.16)]">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function BarChart({ items }: { items: ChartItem[] }) {
  const colored = withColors(items);
  const max = Math.max(1, ...colored.map((i) => i.value));

  if (items.length === 0) {
    return <p className="text-sm text-slate-400 py-6 text-center">Belum ada data.</p>;
  }

  return (
    <div className="space-y-3">
      {colored.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-xs text-slate-600" title={item.label}>{item.label}</span>
          <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${Math.max(3, (item.value / max) * 100)}%`, backgroundImage: item.color.bar }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs font-medium text-slate-700">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Ring progres untuk SATU metrik (mis. completion rate, konversi) --
 *  beda dari DonutChart yang memecah total jadi beberapa kategori. */
export function ProgressRing({
  percent, label, accent = "#f15525",
}: { percent: number; label?: string; accent?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = 40;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;

  return (
    <div className="flex items-center gap-5">
      <svg width="110" height="110" viewBox="0 0 110 110" className="shrink-0">
        <g transform="rotate(-90 55 55)">
          <circle cx="55" cy="55" r={r} fill="none" stroke="#f1f5f9" strokeWidth="14" />
          <circle
            cx="55" cy="55" r={r} fill="none"
            stroke={accent} strokeWidth="14" strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
          />
        </g>
        <text x="55" y="60" textAnchor="middle" fontSize="22" fontWeight="800" fill="#0f172a">{clamped}%</text>
      </svg>
      {label && <p className="text-sm text-slate-500 max-w-[160px]">{label}</p>}
    </div>
  );
}

/** Bar "lollipop" (batang + titik di ujung) buat data deret waktu --
 *  titik terbaru/tertinggi ditonjolkan pakai aksen ember. */
export function TrendBars({ items }: { items: ChartItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400 py-6 text-center">Belum ada data.</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.value));
  const peakIndex = items.reduce((best, cur, i) => (cur.value > items[best].value ? i : best), 0);

  return (
    <div className="flex items-end gap-3 h-40 pt-4">
      {items.map((item, i) => {
        const heightPct = Math.max(4, (item.value / max) * 100);
        const isPeak = i === peakIndex;
        return (
          <div key={item.label} className="flex-1 flex flex-col items-center gap-2">
            <span className={`text-[11px] font-semibold ${isPeak ? "text-ember" : "text-slate-400"}`}>{item.value}</span>
            <div className="w-full flex-1 flex items-end justify-center">
              <div
                className={`w-1.5 rounded-full ${isPeak ? "bg-ember" : "bg-slate-200"}`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 truncate w-full text-center">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Bikin data 6 bulan terakhir dari array tanggal -- dipakai bareng AreaTrendChart di semua dashboard modul. */
export function monthlyTrend(dates: (Date | string | null)[]): ChartItem[] {
  const now = new Date();
  const buckets: ChartItem[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString("id-ID", { month: "short" });
    const count = dates.filter((x) => {
      if (!x) return false;
      const dt = new Date(x);
      return dt.getFullYear() === d.getFullYear() && dt.getMonth() === d.getMonth();
    }).length;
    buckets.push({ label, value: count });
  }
  return buckets;
}

/** Area/line chart gradient halus buat deret waktu -- panel "Overview" utama tiap dashboard modul. */
export function AreaTrendChart({ items, accent = "violet" }: { items: ChartItem[]; accent?: "violet" | "blue" | "pink" | "orange" | "emerald" }) {
  const ACCENT_STOPS: Record<string, [string, string]> = {
    violet: ["#4c1d95", "#db2777"],
    blue: ["#1d4ed8", "#38bdf8"],
    pink: ["#9d174d", "#fb7185"],
    orange: ["#9a3412", "#fb923c"],
    emerald: ["#065f46", "#34d399"],
  };
  const [from, to] = ACCENT_STOPS[accent] ?? ACCENT_STOPS.violet;
  const gradId = `area-fill-${accent}`;
  const lineId = `area-line-${accent}`;

  if (items.length === 0) {
    return <p className="text-sm text-slate-400 py-6 text-center">Belum ada data.</p>;
  }

  const width = 560, height = 170;
  const max = Math.max(1, ...items.map((i) => i.value));
  const stepX = width / (items.length - 1 || 1);
  const points = items.map((it, i) => ({ x: i * stepX, y: 10 + (height - 10) * (1 - it.value / max) }));
  let line = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const midX = (prev.x + cur.x) / 2;
    line += ` C${midX},${prev.y} ${midX},${cur.y} ${cur.x},${cur.y}`;
  }
  const area = `${line} L${points[points.length - 1].x},${height} L0,${height} Z`;

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={from} stopOpacity="0.28" />
            <stop offset="100%" stopColor={from} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={lineId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke={`url(#${lineId})`} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <div className="flex justify-between text-[11px] text-slate-400 px-1 mt-1">
        {items.map((it) => <span key={it.label}>{it.label}</span>)}
      </div>
    </div>
  );
}

export function DonutChart({ items }: { items: ChartItem[] }) {
  const colored = withColors(items);
  const total = colored.reduce((sum, i) => sum + i.value, 0);

  if (total === 0) {
    return <p className="text-sm text-slate-400 py-6 text-center">Belum ada data.</p>;
  }

  const r = 40;
  const c = 2 * Math.PI * r;
  let offsetAcc = 0;

  return (
    <div className="flex items-center gap-6">
      <svg width="110" height="110" viewBox="0 0 110 110" className="shrink-0">
        <g transform="rotate(-90 55 55)">
          <circle cx="55" cy="55" r={r} fill="none" stroke="#f1f5f9" strokeWidth="14" />
          {colored.map((item) => {
            const frac = item.value / total;
            const dash = frac * c;
            const gap = c - dash;
            const el = (
              <circle
                key={item.label}
                cx="55" cy="55" r={r} fill="none"
                stroke={item.color.stroke} strokeWidth="14"
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={-offsetAcc}
              />
            );
            offsetAcc += dash;
            return el;
          })}
        </g>
        <text x="55" y="59" textAnchor="middle" fontSize="18" fontWeight="700" fill="#1e293b">{total}</text>
      </svg>
      <ul className="space-y-1.5 min-w-0">
        {colored.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color.stroke }} />
            <span className="text-slate-600 truncate" title={item.label}>{item.label}</span>
            <span className="text-slate-400">({item.value})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
