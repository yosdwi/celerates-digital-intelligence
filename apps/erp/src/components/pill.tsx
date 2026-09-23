/**
 * Pill status generik sesuai Celerates Design Guideline -- satu bentuk untuk
 * semua status di seluruh modul, warna semantik terpisah dari warna brand
 * (navy/ember) supaya "sukses/warning/gagal" tidak pernah tertukar makna
 * dengan aksen brand.
 */
export type PillVariant = "success" | "warning" | "critical" | "neutral" | "info" | "new";

const VARIANT_STYLES: Record<PillVariant, string> = {
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  critical: "bg-red-50 text-red-700",
  neutral: "bg-slate-100 text-slate-600",
  info: "bg-brand-50 text-brand-700",
  // Aksen terang beda dari 5 warna semantik di atas -- khusus penanda "data baru",
  // bukan status bisnis apa pun (lihat src/components/new-badge.tsx).
  new: "bg-ember-soft text-ember",
};

export function Pill({ variant, children }: { variant: PillVariant; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${VARIANT_STYLES[variant]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0" />
      {children}
    </span>
  );
}
