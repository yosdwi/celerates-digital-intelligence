import { LucideIcon } from "lucide-react";

export function PageHeader({
  icon: Icon,
  color,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon;
  color: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-white/60 bg-white/75 backdrop-blur-xl px-8 py-6 sticky top-0 z-30 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">{eyebrow}</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
          {children && <div className="flex flex-wrap items-center gap-3 mt-3">{children}</div>}
        </div>
      </div>
    </header>
  );
}