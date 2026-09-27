"use client";
// Registry-driven module UI for the mobile shell: tiles, the module landing sheet and access labels.
// Every module shown here comes from lib/modules-config.tsx filtered by lib/module-access.ts (doc 18 §12).
import Link from "next/link";
import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { ArrowRight, Monitor } from "lucide-react";
import { NAV_LABEL_KEYS } from "@/lib/nav-i18n";
import { claimsOf, moduleForPath, openModules, type ModuleAccess, type ResolvedModule } from "@/lib/module-access";
import type { OperationalGroup } from "@/lib/operations/policy";
import { BottomSheet, buttonClass, StatusPill } from "./primitives";

// Jernih tinted tiles (soft ground + saturated glyph), one per registry module.
export const TINTS: Record<string, string> = {
  marketing: "bg-[#e3eefb] text-[#1d5c99]",
  sales: "bg-[#e1f4ee] text-[#0e7a5f]",
  ta: "bg-[#efebfc] text-[#6d4ae0]",
  hr: "bg-[#fce7ec] text-[#b42a48]",
  tm: "bg-[#e2f1fa] text-[#0b6aa6]",
  pmo: "bg-[#e8eefd] text-[#2356e8]",
  finance: "bg-[#e3f4e6] text-[#1c7a36]",
  timesheet: "bg-[#f3e8fd] text-[#8b3fd1]",
  attendance: "bg-[#e1f4f4] text-[#0f766e]",
  executive: "bg-[#eef1f5] text-[#334155]",
  tasks: "bg-[#e0f2f7] text-[#0e6a80]",
  files: "bg-[#eae9fb] text-[#4338ca]",
  ttd: "bg-[#ddf3ef] text-[#0f6d63]",
  school: "bg-[#fae8f7] text-[#a21c8f]",
  automation: "bg-[#eceafd] text-[#5146d8]",
  "feature-requests": "bg-[#fce7f3] text-[#be185d]",
};

export function useModuleLabel() {
  const tNav = useTranslations("nav");
  return (text: string) => (NAV_LABEL_KEYS[text] ? tNav(NAV_LABEL_KEYS[text]) : text);
}

export function useOpenModules(): ResolvedModule[] {
  const { data, status } = useSession();
  // Until the session is known, show nothing rather than the modules of an anonymous back-office user.
  return useMemo(() => (status === "authenticated" ? openModules(claimsOf(data?.user)) : []), [data?.user, status]);
}

export function ModuleGlyph({ module, size = "md" }: { module: ResolvedModule; size?: "sm" | "md" }) {
  const Icon = module.config.icon;
  return (
    <span className={`flex shrink-0 items-center justify-center ${size === "md" ? "h-[38px] w-[38px] rounded-xl" : "h-9 w-9 rounded-[11px]"} ${TINTS[module.key] ?? TINTS.executive}`}>
      <Icon aria-hidden className={size === "md" ? "h-[21px] w-[21px]" : "h-5 w-5"} strokeWidth={1.9} />
    </span>
  );
}

export function AccessPill({ access }: { access: ModuleAccess }) {
  const t = useTranslations("mobile.access");
  const tone = access === "full" || access === "editor" ? "ok" : access === "viewer" ? "muted" : "accent";
  return <StatusPill tone={tone}>{t(access)}</StatusPill>;
}

/** Launcher tile. Opens the module's landing sheet (MS1); MS2 converts modules into full landings. */
export function ModuleTile({ module, signal, onOpen }: { module: ResolvedModule; signal?: number; onOpen: () => void }) {
  const label = useModuleLabel();
  return (
    <button
      type="button"
      onClick={onOpen}
      data-module-tile={module.key}
      className="relative flex min-h-[90px] flex-col items-center justify-center gap-1.5 rounded-j-card border border-j-line bg-j-surface px-1 py-2.5 text-center text-xs font-semibold leading-tight text-j-ink shadow-j-card"
    >
      <ModuleGlyph module={module} />
      <span className="line-clamp-2">{label(module.config.label)}</span>
      {signal ? (
        <span aria-label={`${signal} perlu perhatian`} className="absolute right-2 top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-j-warn-dot px-1 text-[10px] font-extrabold text-white">
          {signal}
        </span>
      ) : null}
    </button>
  );
}

/** Module landing sheet: access, the module's deterministic signals, and its real submodules. */
export function ModuleLandingSheet({ module, signals, onClose }: { module: ResolvedModule | null; signals: OperationalGroup[]; onClose: () => void }) {
  const t = useTranslations("mobile");
  const label = useModuleLabel();
  if (!module) return null;
  const own = signals.filter((g) => g.module === module.key && g.count > 0);
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={label(module.config.label)}
      footer={
        <Link href={module.href} className={buttonClass.primary} onClick={onClose}>
          {t("openModule", { name: label(module.subPages[0]?.label ?? module.config.label) })}
          <ArrowRight className="h-4 w-4" />
        </Link>
      }
    >
      <div className="flex flex-col gap-4" data-module-landing={module.key}>
        <div className="flex items-center gap-3">
          <ModuleGlyph module={module} />
          <p className="flex-1 text-sm text-j-muted">{t(module.group === "bisnis" ? "groupBusiness" : "groupOperational")}</p>
          <AccessPill access={module.access} />
        </div>
        {own.length > 0 && (
          <section aria-label={t("attention")} className="flex flex-col gap-2">
            {own.map((g) => (
              <Link key={g.key} href={g.href} onClick={onClose} className="flex items-center gap-3 rounded-2xl border border-j-warn-line bg-j-warn-soft px-3.5 py-3 text-j-ink">
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-j-warn-dot px-1.5 text-xs font-extrabold text-white">{g.count}</span>
                <span className="flex-1 text-sm font-semibold">{g.title}</span>
                <ArrowRight aria-hidden className="h-4 w-4 text-j-warn-ink" />
              </Link>
            ))}
          </section>
        )}
        <section aria-label={t("submodules")}>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.6px] text-j-muted">{t("submodules")}</h3>
          <ul className="divide-y divide-j-line-soft">
            {module.subPages.map((sub) => {
              const owner = moduleForPath(sub.href);
              const collab = owner && owner.key !== module.key ? owner : null;
              const desktop = module.desktopOnly.includes(sub.href);
              return (
                <li key={sub.href}>
                  <Link href={sub.href} onClick={onClose} className="flex min-h-[52px] items-center gap-3 py-2 text-j-ink" data-submodule={sub.href}>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[15px] font-semibold">{label(sub.label)}</span>
                      {collab && <span className="text-xs text-j-muted">{t("ownedBy", { module: label(collab.label) })}</span>}
                    </span>
                    {desktop && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-j-muted">
                        <Monitor aria-hidden className="h-3.5 w-3.5" /> {t("desktop")}
                      </span>
                    )}
                    <ArrowRight aria-hidden className="h-4 w-4 text-j-faint" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </BottomSheet>
  );
}
