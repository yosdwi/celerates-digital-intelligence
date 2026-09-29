import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { claimsOf, navModules } from "@/lib/module-access";
import { MobileHome } from "@/components/mobile/mobile-home";
import { NAV_LABEL_KEYS } from "@/lib/nav-i18n";
import { ModuleCard } from "@/components/module-card";
import { getTranslations } from "next-intl/server";

export default async function HomePage() {
  const t = await getTranslations("home");
  const tNav = await getTranslations("nav");
  const session = await getServerSession(authOptions);
  // One canonical visibility rule shared with the sidebar and the mobile shell (lib/module-access.ts).
  // Division modules without access stay listed here, locked, as before.
  const visibleModules = navModules(claimsOf(session?.user));

  function moduleLabel(text: string): string {
    const key = NAV_LABEL_KEYS[text];
    return key ? tNav(key) : text;
  }

  return (
    <>
    {/* Phone: the Jernih mobile Beranda (doc 18 §12). Desktop below is unchanged. */}
    <div className="md:hidden">
      <MobileHome />
    </div>
    <div className="hidden md:block min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-brand-50/40">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm px-8 py-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">Celerates ERP</p>
        <h1 className="text-3xl font-bold text-slate-900 mt-1">{t("title")}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
      </header>

      <main className="px-8 py-12 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleModules.map(({ config: mod, href: target, access }) => {
            const Icon = mod.icon;
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
                hasAccess={access !== "none"}
              />
            );
          })}
        </div>
      </main>
    </div>
    </>
  );
}