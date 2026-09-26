export const CARD_ACCENTS = {
  violet: "linear-gradient(90deg,#7c3aed,#a78bfa)",
  blue: "linear-gradient(90deg,#2563eb,#60a5fa)",
  pink: "linear-gradient(90deg,#db2777,#f472b6)",
  orange: "linear-gradient(90deg,#ea580c,#fb923c)",
  emerald: "linear-gradient(90deg,#059669,#34d399)",
  rose: "linear-gradient(90deg,#be123c,#fb7185)",
  amber: "linear-gradient(90deg,#b45309,#fbbf24)",
} as const;

export type CardAccent = keyof typeof CARD_ACCENTS;
const ACCENT_KEYS = Object.keys(CARD_ACCENTS) as CardAccent[];

/** Cycle warna aksen berdasarkan index -- dipakai kalau kartu di-render dari .map() dan mau tiap kartu beda warna. */
export function pickAccent(index: number): CardAccent {
  return ACCENT_KEYS[index % ACCENT_KEYS.length];
}

/**
 * Kartu grid glass + garis aksen gradient di atas -- pengganti kartu flat putih
 * polos di semua tampilan grid/card modul (kandidat, opportunity, employee, dst).
 * Cuma bungkus visual; konten di dalamnya (data, link, tombol) tidak berubah.
 */
export function GridCard({
  accent = "violet",
  className = "",
  children,
}: {
  accent?: CardAccent;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative flex flex-col h-full overflow-hidden rounded-2xl border border-white/70 bg-white/78 backdrop-blur-xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_24px_-14px_rgba(15,23,42,0.12)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_20px_34px_-14px_rgba(15,23,42,0.18)] ${className}`}
    >
      <span className="absolute top-0 left-0 right-0 h-1" style={{ backgroundImage: CARD_ACCENTS[accent] }} />
      {children}
    </div>
  );
}
