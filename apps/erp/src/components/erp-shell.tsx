"use client";
// The ERP's app shell on Crisp (QA 2026-10-09, docs/audit/SALES-V2-UX-AUDIT-2026-10-09.md §4), the Attio pattern Crisp
// was measured from:
// - Sidebar: Quick Actions (⌘K) with search, Beranda, one collapsible group per module.
// - Header bar: where you are, and the Agent, notifications, language and account.
// Same modules and access rules as the classic sidebar (lib/module-access). The person can switch the sidebar tone, the
// page look, or go back to the classic shell from the workspace menu (lib/ui-preferences).
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { AppShell, Button, HeaderBar, MenuItem, Sidebar, type CommandItem, type SidebarNavGroup } from "@crisp-ui-kit/crisp";
import { Dot, Home, LayoutTemplate, LogOut, Moon, Share2, Sparkles, Sun, Undo2, UserRound } from "lucide-react";
import { claimsOf, navModules, submoduleFor } from "@/lib/module-access";
import { NAV_LABEL_KEYS } from "@/lib/nav-i18n";
import { useNavModule } from "@/lib/nav-module";
import { openAgent } from "@/components/mobile/events";
import { setUiPreference } from "@/app/ui-preferences-actions";
import type { UiPrefs } from "@/lib/ui-preferences";
import { PAGE_ICON } from "./sidebar";
import { NotificationBell } from "./notification-bell";
import { LanguageSwitcher } from "./language-switcher";
import { ActivityLogLink } from "./activity-log-link";
import { UserMenu } from "./user-menu";
import { MobileContextBar } from "./mobile/tab-bar";

export function ErpShell({ prefs, children }: { prefs: UiPrefs; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const t = useTranslations("sidebar");
  const tNav = useTranslations("nav");
  const label = (text: string) => { const key = NAV_LABEL_KEYS[text]; return key ? tNav(key) : text; };
  const active = useNavModule(pathname);
  const current = submoduleFor(pathname);
  const [navigating, startNav] = useTransition();
  const [, startPref] = useTransition();
  const modules = useMemo(() => (status === "authenticated" ? navModules(claimsOf(session?.user)) : []), [status, session]);

  // Like Attio's groups: the module you are in is open, the others folded; a person can still open any of them.
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => { setCollapsed(modules.map((m) => m.config.key).filter((k) => k !== active?.key)); }, [modules, active?.key]);

  const go = (href: string) => () => startNav(() => router.push(href));
  const pref = <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => startPref(async () => { await setUiPreference(key, value); router.refresh(); });

  if (status !== "authenticated") return <main className="min-h-screen">{children}</main>;

  const groups: SidebarNavGroup[] = modules.map(({ config: mod, subPages }) => ({
    key: mod.key,
    label: label(mod.label),
    items: [...subPages.filter((s) => !s.collab), ...subPages.filter((s) => s.collab)].map((sub) => ({
      label: label(sub.label),
      icon: PAGE_ICON[sub.href] ?? Dot,
      href: sub.href,
      onSelect: (e: React.MouseEvent<HTMLAnchorElement>) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); go(sub.href)(); },
      active: current?.href === sub.href,
      meta: sub.collab ? <Share2 size={12} aria-label={t("sharedPages")} /> : undefined,
    })),
  }));
  const commandItems: CommandItem[] = [
    { id: "agent", label: "Tanya Agent", icon: Sparkles, group: "Aksi", keywords: ["ai", "agent", "tanya"], onSelect: () => openAgent() },
    { id: "home", label: t("home"), icon: Home, group: "Aksi", onSelect: go("/") },
    ...modules.flatMap(({ config: mod, subPages }) => subPages.map((sub) => ({
      id: `${mod.key}:${sub.href}`, label: label(sub.label), icon: PAGE_ICON[sub.href] ?? Dot, group: label(mod.label),
      keywords: [label(mod.label), sub.href], onSelect: go(sub.href),
    }))),
  ];
  const firstName = ((session?.user as { fullName?: string })?.fullName ?? session?.user?.name ?? "").split(" ")[0];
  const where = pathname === "/" ? t("home") : [active ? label(active.label) : null, current ? label(current.label) : null].filter(Boolean).join(" / ");

  return (
    <div data-erp-shell className="lg:mr-[var(--agent-rail,0px)]">
      <AppShell
        expandLabel={t("showMenu")}
        expandShortcut={["Ctrl", "."]}
        sidebar={(toggle) => (
          <Sidebar
            style={{ width: "100%" }}
            onToggleCollapse={toggle}
            collapseLabel={t("hideMenu")}
            searchLabel="Quick Actions"
            workspace={{ name: "Celerates ERP", avatarLabel: "C" }}
            workspaceMenu={<>
              <MenuItem icon={prefs.sidebar === "dark" ? <Sun size={14} /> : <Moon size={14} />} onSelect={() => pref("sidebar", prefs.sidebar === "dark" ? "light" : "dark")}>
                {prefs.sidebar === "dark" ? "Sidebar terang" : "Sidebar gelap"}
              </MenuItem>
              <MenuItem icon={<LayoutTemplate size={14} />} onSelect={() => pref("look", prefs.look === "hybrid" ? "v1" : "hybrid")}>
                {prefs.look === "hybrid" ? "Tampilan halaman: kembali ke saat ini" : "Tampilan halaman: coba Hybrid"}
              </MenuItem>
              <MenuItem icon={<Undo2 size={14} />} onSelect={() => pref("shell", "classic")}>Kembali ke tampilan lama</MenuItem>
              <MenuItem icon={<UserRound size={14} />} onSelect={go("/profile")}>Profil</MenuItem>
              <MenuItem icon={<LogOut size={14} />} onSelect={() => signOut({ callbackUrl: "/login" })}>Keluar</MenuItem>
            </>}
            items={[{ label: t("home"), icon: Home, href: "/", active: pathname === "/", onSelect: (e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); go("/")(); } }]}
            groups={groups}
            collapsedSections={collapsed}
            onCollapsedChange={setCollapsed}
            commandItems={commandItems}
            footer={
              <div className="px-3 py-2 text-[0.75rem] leading-snug text-[var(--crisp-fg-muted)]">
                <p className="truncate font-medium text-[var(--crisp-fg-primary)]">{t("greeting", { name: firstName })}</p>
                <p>PT Mitra Talenta Grup</p>
              </div>
            }
          />
        )}
      >
        <div data-erp-shell-header className="relative">
          <HeaderBar
            bordered
            title={<span className="truncate">{where}</span>}
            trailing={
              <div className="flex items-center gap-2">
                <Button size="sm" intent="ghost" onClick={() => openAgent()}><Sparkles size={14} /> Tanya Agent</Button>
                <ActivityLogLink inline />
                <LanguageSwitcher inline />
                <NotificationBell inline />
                <UserMenu inline />
              </div>
            }
          />
          {navigating && <div data-erp-progress aria-hidden />}
        </div>
        <main data-erp-shell-main className="min-w-0 pb-[calc(88px+env(safe-area-inset-bottom))] md:pb-6">
          <MobileContextBar />
          {children}
        </main>
      </AppShell>
    </div>
  );
}
