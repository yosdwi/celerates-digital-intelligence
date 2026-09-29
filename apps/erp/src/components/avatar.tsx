const GRADIENTS = [
  "linear-gradient(135deg,#7c3aed,#a78bfa)",
  "linear-gradient(135deg,#2563eb,#60a5fa)",
  "linear-gradient(135deg,#db2777,#f472b6)",
  "linear-gradient(135deg,#ea580c,#fb923c)",
  "linear-gradient(135deg,#059669,#34d399)",
  "linear-gradient(135deg,#be123c,#fb7185)",
  "linear-gradient(135deg,#b45309,#fbbf24)",
];

/** Hash nama jadi index warna -- nama yang sama selalu dapat warna yang sama, tanpa perlu nyimpen mapping di mana pun. */
function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Lingkaran inisial gradient -- dipakai di sel nama tabel & kartu grid di semua modul, biar konsisten tanpa perlu foto asli. */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const dims = size === "sm" ? "h-8 w-8 rounded-lg text-[10px]" : size === "lg" ? "h-11 w-11 rounded-xl text-sm" : "h-9 w-9 rounded-lg text-xs";
  return (
    <div
      className={`flex ${dims} shrink-0 items-center justify-center font-bold text-white`}
      style={{ backgroundImage: colorFor(name || "?") }}
    >
      {initialsOf(name || "?")}
    </div>
  );
}
