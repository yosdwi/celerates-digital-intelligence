const GRADIENTS: Record<string, { bg: string; glow: string }> = {
  indigo: { bg: "linear-gradient(135deg, #7c3aed, #a78bfa)", glow: "rgba(124,58,237,0.35)" },
  green: { bg: "linear-gradient(135deg, #059669, #34d399)", glow: "rgba(5,150,105,0.32)" },
  amber: { bg: "linear-gradient(135deg, #b45309, #fbbf24)", glow: "rgba(180,83,9,0.32)" },
  red: { bg: "linear-gradient(135deg, #be123c, #fb7185)", glow: "rgba(190,18,60,0.32)" },
  blue: { bg: "linear-gradient(135deg, #2563eb, #60a5fa)", glow: "rgba(37,99,235,0.35)" },
  purple: { bg: "linear-gradient(135deg, #9333ea, #d8b4fe)", glow: "rgba(147,51,234,0.32)" },
  pink: { bg: "linear-gradient(135deg, #db2777, #f472b6)", glow: "rgba(219,39,119,0.32)" },
  orange: { bg: "linear-gradient(135deg, #ea580c, #fb923c)", glow: "rgba(234,88,12,0.32)" },
  navy: { bg: "linear-gradient(135deg, var(--color-brand-600), var(--color-brand-800))", glow: "rgba(25,70,103,0.35)" },
};

export function StatCard({
    label,
    value,
    sublabel,
    color = "slate",
  }: {
    label: string;
    value: number | string;
    sublabel?: string;
    color?: "slate" | "indigo" | "green" | "amber" | "red" | "blue" | "purple" | "pink" | "orange" | "navy";
  }) {
    // "slate" tetap netral (kartu kaca tanpa gradient) buat stat yang tidak
    // perlu ditonjolkan -- semua warna lain jadi gradient vivid + glow shadow
    // biar tidak monoton, mengikuti arah desain "colorful modern SaaS".
    if (color === "slate") {
      return (
        <div className="rounded-2xl p-4 border border-white/70 bg-white/70 backdrop-blur-xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_24px_-14px_rgba(15,23,42,0.12)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(15,23,42,0.05),0_18px_32px_-14px_rgba(15,23,42,0.18)]">
          <p className="text-xs font-medium tracking-wide text-slate-500">{label}</p>
          <p className="text-[26px] font-extrabold tracking-tight mt-1 text-slate-900 [font-variant-numeric:tabular-nums]">{value}</p>
          {sublabel && <p className="text-xs font-medium text-slate-400 mt-0.5">{sublabel}</p>}
        </div>
      );
    }

    const g = GRADIENTS[color];
    return (
      <div
        className="relative overflow-hidden rounded-2xl p-4 text-white transition-all duration-300 hover:-translate-y-0.5"
        style={{ backgroundImage: g.bg, boxShadow: `0 1px 2px rgba(15,23,42,0.08), 0 16px 30px -14px ${g.glow}` }}
      >
        <span className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-white/15" />
        <p className="relative text-xs font-medium tracking-wide text-white/85">{label}</p>
        <p className="relative text-[26px] font-extrabold tracking-tight mt-1 [font-variant-numeric:tabular-nums]">{value}</p>
        {sublabel && <p className="relative text-xs font-medium text-white/75 mt-0.5">{sublabel}</p>}
      </div>
    );
  }
