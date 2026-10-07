"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight, BookUser, Bot, Building, Building2, Calculator, CalendarCheck, CalendarOff, ChevronLeft, ChevronRight, ClipboardList, Clock,
  Database, Dot, DoorOpen, FileSignature, FileText, FolderCheck, FolderOpen, Gauge, GraduationCap, Handshake, History, Home, House, KanbanSquare,
  Landmark, LayoutDashboard, Lightbulb, MapPin, PenTool, PiggyBank, Plane, Receipt, Repeat, Settings2, Share2, ShieldCheck, StickyNote, Target,
  UserSearch, Users, Workflow, type LucideIcon,
} from "lucide-react";
import { MODULES } from "@/lib/modules-config";
import { claimsOf, navModules, submoduleFor } from "@/lib/module-access";
import { NAV_LABEL_KEYS } from "@/lib/nav-i18n";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useSidebarCollapse } from "./sidebar-context";

// One small icon per page (Attio-style list rows). Pages without an entry get a neutral dot.
const PAGE_ICON: Record<string, LucideIcon> = {
  "/marketing/dashboard": LayoutDashboard, "/marketing": Target, "/sales/accounts": Building2,
  "/sales/dashboard": LayoutDashboard, "/sales/v2/opportunity-tracker": Handshake, "/sales/v2/pq-tracker": FileText,
  "/ta/client-active": Building, "/pmo/overtime-business-trip": Plane, "/sales/profitability-tracker": PiggyBank,
  "/ta/dashboard": LayoutDashboard, "/ta": ClipboardList, "/ta/candidates": UserSearch, "/ta/pipeline": Workflow, "/ta/onboarding": DoorOpen,
  "/hr/dashboard": LayoutDashboard, "/hr": Users, "/hr/extension-requests": Repeat, "/hr/attendance": CalendarCheck, "/hr/attendance-settings": Settings2,
  "/tm/special-notes": StickyNote, "/tm/dashboard": LayoutDashboard, "/tm": BookUser, "/tm/database-salary": Database, "/tm/cogs-calculator": Calculator,
  "/tm/extension-requests": Repeat, "/pmo/dashboard": LayoutDashboard, "/pmo/contracts": FileSignature, "/pmo": FolderCheck, "/pmo/invoices": Receipt,
  "/pmo/readiness": ShieldCheck, "/finance": Landmark, "/timesheet": Clock, "/timesheet/converter": ArrowLeftRight, "/attendance": House,
  "/attendance/live": MapPin, "/attendance/history": History, "/attendance/time-off": CalendarOff, "/executive-dashboard": Gauge, "/tasks": KanbanSquare,
  "/files": FolderOpen, "/ttd-online": PenTool, "/feature-requests": Lightbulb, "/school": GraduationCap, "/school/my-learning": GraduationCap,
  "/automation/reminders": Bot, "/automation/documents": FileText,
};

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

  const accountType = ((session?.user as any)?.accountType ?? "backoffice") as string;
  const isTalent = accountType === "talent";
  // One canonical visibility rule (lib/module-access.ts, doc 18 §14): talents see Timesheet & Attendance;
  // Timesheet needs PMO Full (or Owner); Executive is Owner-only; Feature Request is reached through Masukan.
  const visibleModules = navModules(claimsOf(session?.user));

  const activeModule = MODULES.find(
    (m) => pathname === m.basePath || pathname.startsWith(m.basePath + "/")
  );

  // The page the current URL belongs to (longest match; a V1 Sales page counts as its V2 entry).
  const currentHref = submoduleFor(pathname)?.href;

  if (status !== "authenticated") return null;

  const firstName = ((session?.user as any)?.fullName ?? session?.user?.name ?? "Sobat Celerates").split(" ")[0];

  return (
    <aside className={`hidden md:flex fixed inset-y-0 left-0 border-r border-slate-800 bg-slate-900 flex-col transition-all duration-200 z-30 ${collapsed ? "w-16" : "w-60"}`}>
      <div className={`flex items-center gap-2.5 px-3 py-3 ${collapsed ? "justify-center px-0" : ""}`}>
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <Image src="/logo-celerates.jpg" alt="Celerates" width={28} height={28} className="rounded-md shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white leading-none truncate">Celerates</p>
              <p className="text-[0.6875rem] text-slate-400 leading-none mt-0.5">ERP</p>
            </div>
          )}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {!isTalent && (
          <Link
            href="/"
            title={t("home")}
            className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[0.8125rem] transition-colors mb-0.5 ${collapsed ? "justify-center" : ""} ${
              pathname === "/" ? "bg-brand-500/10 text-brand-300 font-medium" : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            <Home className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{t("home")}</span>}
          </Link>
        )}

        {visibleModules.map(({ config: mod, subPages, href: target }) => {
          const Icon = mod.icon;
          const isTimesheetModule = mod.key === "timesheet";
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
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[0.8125rem] transition-colors ${collapsed ? "justify-center" : ""} ${moduleLinkClass}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{label(mod.label)}</span>
                    {isTimesheetModule && (
                      <span className="shrink-0 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-wide text-orange-300">
                        Talent
                      </span>
                    )}
                  </span>
                )}
              </Link>
              {!collapsed && isTimesheetModule && !isModuleActive && (
                <p className="px-2.5 mt-0.5 text-[0.625rem] text-slate-500 leading-snug">{t("talentOnlyNote")}</p>
              )}

              {!collapsed && isModuleActive && (
                <div className="ml-3 mt-0.5 mb-1 space-y-px border-l border-slate-800 pl-2">
                  {/* Own pages first (with optional group headings), then pages shared with other divisions under one
                      heading. Same row style for both: a shared page is marked by its heading and a small icon, not a box. */}
                  {[...subPages.filter((s) => !s.collab), ...subPages.filter((s) => s.collab)].map((sub, i, list) => {
                    const isActive = currentHref === sub.href;
                    const heading = sub.collab ? t("sharedPages") : sub.group;
                    const prev = list[i - 1];
                    const showHeading = heading && (!prev || (prev.collab ? t("sharedPages") : prev.group) !== heading);
                    const PageIcon = PAGE_ICON[sub.href] ?? Dot;
                    return (
                      <div key={sub.href}>
                        {showHeading && (
                          <p className="px-2 pb-0.5 pt-1.5 text-[0.625rem] font-semibold uppercase tracking-wider text-slate-500">{heading}</p>
                        )}
                        <Link
                          href={sub.href}
                          aria-current={isActive ? "page" : undefined}
                          className={`flex items-center gap-2 rounded-md px-2 py-1 text-[0.8125rem] transition-colors ${
                            isActive
                              ? (isTimesheetModule ? "bg-orange-500/10 text-orange-300 font-medium" : "bg-brand-500/15 text-white font-medium")
                              : (isTimesheetModule ? "text-slate-400 hover:bg-orange-500/10 hover:text-orange-300" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200")
                          }`}
                        >
                          <PageIcon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{label(sub.label)}</span>
                          {sub.collab && <Share2 className="h-3 w-3 shrink-0 text-slate-500" aria-label={t("sharedPages")} />}
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className={`px-3 py-2 border-t border-slate-800 flex items-center gap-2 ${collapsed ? "flex-col" : "justify-between"}`}>
        <div className="min-w-0">
          {!collapsed && (
            <p className="text-xs font-medium text-slate-300 leading-snug truncate">
              {t("greeting", { name: firstName })}
            </p>
          )}
          <p className="text-[0.6875rem] text-slate-500 mt-0.5">{collapsed ? "PMTG" : "PT Mitra Talenta Grup"}</p>
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
