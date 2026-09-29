"use client";
// Modul tab (doc 18 §12): the full directory the user can open, grouped Bisnis / Operasional, with the real
// access level and real submodules. Tapping a module opens its landing sheet.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { ResolvedModule } from "@/lib/module-access";
import { useMobileData } from "./data";
import { AccessPill, ModuleGlyph, ModuleLandingSheet, useModuleLabel, useOpenModules } from "./modules";
import { Card, GroupLabel, MobileScreen, Row, RowList, ScreenTitle } from "./primitives";

export function ModuleDirectory() {
  const t = useTranslations("mobile");
  const label = useModuleLabel();
  const modules = useOpenModules();
  const { signals } = useMobileData();
  const [query, setQuery] = useState("");
  const [landing, setLanding] = useState<ResolvedModule | null>(null);
  const q = query.trim().toLowerCase();
  const match = (m: ResolvedModule) =>
    !q || label(m.config.label).toLowerCase().includes(q) || m.subPages.some((s) => label(s.label).toLowerCase().includes(q));
  const groups = [
    { key: "bisnis", title: t("groupBusiness"), items: modules.filter((m) => m.group === "bisnis" && match(m)) },
    { key: "operasional", title: t("groupOperational"), items: modules.filter((m) => m.group === "operasional" && match(m)) },
  ];
  return (
    <MobileScreen label={t("tabs.modules")}>
      <div data-module-directory className="flex flex-col gap-4">
        <ScreenTitle title={t("tabs.modules")} subtitle={t("directorySubtitle", { count: modules.length })} />
        <label className="flex h-[46px] items-center gap-2.5 rounded-j-field bg-j-field px-3.5">
          <Search aria-hidden className="h-[18px] w-[18px] text-j-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchModules")} aria-label={t("searchModules")} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-j-muted" />
        </label>
        {groups.map((g) =>
          g.items.length === 0 ? null : (
            <section key={g.key} className="flex flex-col gap-2">
              <GroupLabel>{g.title}</GroupLabel>
              <RowList label={g.title}>
                {g.items.map((m) => (
                  <Row
                    key={m.key}
                    onClick={() => setLanding(m)}
                    leading={<ModuleGlyph module={m} />}
                    title={label(m.config.label)}
                    subtitle={m.subPages.map((s) => label(s.label)).join(" · ")}
                    trailing={<AccessPill access={m.access} />}
                  />
                ))}
              </RowList>
            </section>
          ),
        )}
        {groups.every((g) => g.items.length === 0) && <Card className="p-4 text-sm text-j-muted">{q ? t("noMatch") : t("noModules")}</Card>}
      </div>
      <ModuleLandingSheet module={landing} signals={signals ?? []} onClose={() => setLanding(null)} />
    </MobileScreen>
  );
}
