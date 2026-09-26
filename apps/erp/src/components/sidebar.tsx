"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";
import { MODULES } from "@/lib/modules-config";
import { NAV_LABEL_KEYS } from "@/lib/nav-i18n";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useSidebarCollapse } from "./sidebar-context";

export function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { collapsed, toggle } = useSidebarCollapse();
  const t = useTranslations("sidebar");
  const tNav = useTranslations("nav");

  function label(text: string): string {
    const key = NAV_LABEL_KEYS[text];
    return key ? tNav(key) : text;
  }

  const isOwner = Boolean((session?.user as any)?.isOwner);
  const accountType = ((session?.user as any)?.accountType ?? "backoffice") as string;
  const canUseTimesheetConverter = Boolean((session?.user as any)?.canUseTimesheetConverter);
  const access = ((session?.user as any)?.access ?? []) as { divisionKey: string; level: string }[];
  const isTalent = accountType === "talent";
  const hasPmoFull = isOwner || access.some((a) => a.divisionKey === "pmo" && a.level === "full");

  // Talent cuma boleh lihat modul Timesheet & Attendance (tanpa Beranda/modul lain sama sekali).
  // Backoffice cuma lihat modul Timesheet kalau punya akses divisi PMO level Full (atau Owner);
  // Attendance selalu kebuka buat Backoffice divisi apa pun (self-service absen); sisanya sama
  // seperti sebelumnya (feature-requests disembunyikan, executive cuma buat Owner).
  const visibleModules = isTalent
    ? MODULES.filter((mod) => mod.key === "timesheet" || mod.key === "attendance")
    : MODULES.filter((mod) =>
        mod.key !== "feature-requests" &&
        (mod.key !== "executive" || isOwner) &&
        (mod.key !== "timesheet" || hasPmoFull)
      );

  const activeModule = MODULES.find(
    (m) => pathname === m.basePath || pathname.startsWith(m.basePath + "/")
  );

  if (status !== "authenticated") return null;

  const firstName = ((session?.user as any)?.fullName ?? session?.user?.name ?? "Sobat Celerates").split(" ")[0];

  return (
    <aside className={`fixed inset-y-0 left-0 border-r border-slate-800 bg-slate-900 flex flex-col transition-all duration-200 z-30 ${collapsed ? "w-16" : "w-64"}`}>
      <div className={`flex items-center gap-3 px-3 py-6 ${collapsed ? "justify-center px-0" : ""}`}>
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <Image src="/logo-celerates.jpg" alt="Celerates" width={36} height={36} className="rounded-lg shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-base font-semibold text-white leading-none truncate">Celerates</p>
              <p className="text-xs text-slate-400 leading-none mt-1">ERP</p>
            </div>
          )}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {!isTalent && (
          <Link
            href="/"
            title={t("home")}
            className={`flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm transition-colors mb-1 ${collapsed ? "justify-center" : ""} ${
              pathname === "/" ? "bg-brand-500/10 text-brand-300 font-medium" : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            <Home className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{t("home")}</span>}
          </Link>
        )}

        {visibleModules.map((mod) => {
          const Icon = mod.icon;
          const isTimesheetModule = mod.key === "timesheet";
          const subPages = isTimesheetModule && !hasPmoFull && !canUseTimesheetConverter
            ? mod.subPages.filter((sp) => sp.href !== "/timesheet/converter")
            : mod.subPages;
          const target = subPages[0]?.href ?? mod.basePath;
          const isModuleActive = mod.key === activeModule?.key;

          // Modul Timesheet dikasih aksen oranye (bukan biru/brand seperti modul
          // lain) supaya kelihatan beda -- ini menu khusus Talent (satu-satunya
          // modul yang akun Talent bisa akses), jadi perlu menonjol di sidebar.
          const moduleLinkClass = isModuleActive
            ? (isTimesheetModule ? "bg-orange-500/10 text-orange-300 font-medium" : "bg-brand-500/10 text-brand-300 font-medium")
            : (isTimesheetModule ? "text-slate-300 hover:bg-orange-500/10 hover:text-orange-300" : "text-slate-300 hover:bg-slate-800");

          return (
            <div key={mod.key}>
              <Link
                href={target}
                title={isTimesheetModule ? `${label(mod.label)}${t("talentOnlySuffix")}` : label(mod.label)}
                className={`flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm transition-colors ${collapsed ? "justify-center" : ""} ${moduleLinkClass}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{label(mod.label)}</span>
                    {isTimesheetModule && (
                      <span className="shrink-0 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-orange-300">
                        Talent
                      </span>
                    )}
                  </span>
                )}
              </Link>
              {!collapsed && isTimesheetModule && !isModuleActive && (
                <p className="px-2.5 mt-0.5 text-[10px] text-slate-500 leading-snug">{t("talentOnlyNote")}</p>
              )}

              {!collapsed && isModuleActive && (
                <div className="ml-3 mt-0.5 mb-1 space-y-0.5 border-l border-slate-800 pl-3">
                  {subPages.map((sub) => {
                    const isActive = pathname === sub.href;
                    if (sub.collab) {
                      const c = sub.collabColor ?? "teal";
                      const activeClass = c === "orange" ? "bg-orange-500/10 text-orange-300 font-medium border-orange-500/30" : "bg-teal-500/10 text-teal-300 font-medium border-teal-500/30";
                      const idleClass = c === "orange" ? "text-orange-400/90 border-orange-500/20 hover:bg-orange-500/10" : "text-teal-400/90 border-teal-500/20 hover:bg-teal-500/10";
                      const dotClass = c === "orange" ? "bg-orange-400" : "bg-teal-400";
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors border ${isActive ? activeClass : idleClass}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
                          <span className="truncate">{label(sub.label)}</span>
                        </Link>
                      );
                    }
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={`block rounded-lg px-2.5 py-2 text-xs transition-colors ${
                          isActive
                            ? (isTimesheetModule ? "bg-orange-500/10 text-orange-300 font-medium" : "bg-brand-500/10 text-brand-300 font-medium")
                            : (isTimesheetModule ? "text-slate-400 hover:bg-orange-500/10 hover:text-orange-300" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200")
                        }`}
                      >
                        {label(sub.label)}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className={`px-4 py-4 border-t border-slate-800 flex items-center gap-2 ${collapsed ? "flex-col" : "justify-between"}`}>
        <div className="min-w-0">
          {!collapsed && (
            <p className="text-xs font-medium text-slate-300 leading-snug truncate">
              {t("greeting", { name: firstName })}
            </p>
          )}
          <p className="text-[11px] text-slate-500 mt-1">{collapsed ? "PMTG" : "PT Mitra Talenta Grup"}</p>
        </div>
        <button
          onClick={toggle}
          title={collapsed ? t("showMenu") : t("hideMenu")}
          className="flex items-center justify-center h-7 w-7 rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200 transition-colors shrink-0"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
