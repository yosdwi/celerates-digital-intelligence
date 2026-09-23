import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { MODULES } from "@/lib/modules-config";
import { NAV_LABEL_KEYS } from "@/lib/nav-i18n";
import { ModuleCard } from "@/components/module-card";
import { getTranslations } from "next-intl/server";

// Key modul yang benar-benar digerbang per-divisi (cocok dengan DIVISION_PATHS
// di lib/division-map.ts) -- selain ini (Task Board, TTD Online, dst) kebuka
// buat semua user yang login, jadi nggak perlu dicek akses.
const DIVISION_GATED_MODULE_KEYS = new Set(["marketing", "sales", "ta", "hr", "tm", "pmo", "finance", "school"]);

export default async function HomePage() {
  const t = await getTranslations("home");
  const tNav = await getTranslations("nav");
  const session = await getServerSession(authOptions);
  const isOwner = Boolean((session?.user as any)?.isOwner);
  const access = ((session?.user as any)?.access ?? []) as { divisionKey: string; level: string }[];
  const myDivisionKeys = new Set(access.map((a) => a.divisionKey));
  const hasPmoFull = isOwner || access.some((a) => a.divisionKey === "pmo" && a.level === "full");
  // Timesheet cuma buat Backoffice dengan akses PMO level Full (Talent nggak
  // pernah lihat Beranda sama sekali -- middleware sudah redirect mereka
  // langsung ke /timesheet), sama seperti filter di sidebar.
  const visibleModules = MODULES.filter((mod) =>
    mod.key !== "feature-requests" && (mod.key !== "executive" || isOwner) && (mod.key !== "timesheet" || hasPmoFull)
  );

  function hasModuleAccess(key: string): boolean {
    if (!DIVISION_GATED_MODULE_KEYS.has(key)) return true;
    return isOwner || myDivisionKeys.has(key);
  }

  function moduleLabel(text: string): string {
    const key = NAV_LABEL_KEYS[text];
    return key ? tNav(key) : text;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-brand-50/40">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm px-8 py-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">Celerates ERP</p>
        <h1 className="text-3xl font-bold text-slate-900 mt-1">{t("title")}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
      </header>

      <main className="px-8 py-12 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleModules.map((mod) => {
            const Icon = mod.icon;
            const target = mod.subPages[0]?.href ?? mod.basePath;
            const descKey = `descriptions.${mod.key}`;
            const desc = t.has(descKey) ? t(descKey) : undefined;

            if (!mod.enabled) {
              return (
                <div
                  key={mod.key}
                  className="rounded-2xl border border-slate-200 bg-white/60 p-6 flex items-center gap-4 opacity-60"
                >
                  <div className={`h-12 w-12 rounded-xl ${mod.color} flex items-center justify-center flex-shrink-0 opacity-70`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-700">{moduleLabel(mod.label)}</p>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">{t("comingSoon")}</span>
                  </div>
                </div>
              );
            }

            return (
              <ModuleCard
                key={mod.key}
                href={target}
                label={moduleLabel(mod.label)}
                description={desc}
                icon={<Icon className="h-6 w-6 text-white" />}
                color={mod.color}
                hasAccess={hasModuleAccess(mod.key)}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}