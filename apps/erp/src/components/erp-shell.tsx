"use client";
// The ERP's app shell (QA doc pages 15–17, 2026-10-09), Attio's layout on Crisp:
// - Sidebar:
//   - Celerates and Quick Actions (⌘K: pages and actions).
//   - Beranda and Notifikasi.
//   - Modul: each module with its icon, its pages indented under a guide line.
//   - The person's profile pinned at the bottom.
// - Header: where you are (module and page icons), who else is on this page, and Tanya Agent at the far right, like
//   "Ask Attio". Beranda leaves Tanya Agent out: its own composer asks, and the answer fills the page (QA pages 21–23).
// The profile menu holds language, sidebar tone, page look, the classic shell and sign-out (lib/ui-preferences). Same
// modules and access rules as before (lib/module-access).
import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { AppShell, Avatar, AvatarGroup, Button, Command, HeaderBar, Kbd, type CommandItem } from "@crisp-ui-kit/crisp";
import {
  Bell, ChevronRight, Dot, FileText, History, Home, KeyRound, LayoutTemplate, LogOut, Moon, PanelLeftClose, Search, Sparkles, Sun, Undo2, UserRound,
} from "lucide-react";
import { claimsOf, navModules, submoduleFor } from "@/lib/module-access";
import { NAV_LABEL_KEYS } from "@/lib/nav-i18n";
import { useNavModule } from "@/lib/nav-module";
import { openAgent } from "@/components/mobile/events";
import { setUiPreference } from "@/app/ui-preferences-actions";
import { setLocale } from "@/lib/locale-actions";
import { getMyNotifications } from "@/app/notifications/actions";
import type { UiPrefs } from "@/lib/ui-preferences";
import { PAGE_ICON } from "./sidebar";
import { MobileContextBar } from "./mobile/tab-bar";

/** Which shell a page sits in, so a page can leave out what the shell already shows (its title, for one). */
const ShellContext = createContext<"crisp" | "classic">("classic");
export const useShell = () => useContext(ShellContext);

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
  const [commandOpen, setCommandOpen] = useState(false);
  const modules = useMemo(() => (status === "authenticated" ? navModules(claimsOf(session?.user)) : []), [status, session]);
  const go = (href: string) => startNav(() => router.push(href));
  const [query, setQuery] = useState("");
  const records = useRecordSearch(commandOpen ? query : "");
  const viewers = usePresence(status === "authenticated" ? pathname : null);

  // ⌘K / Ctrl+K anywhere opens Quick Actions; "/" outside a text field opens it to search records.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCommandOpen((o) => !o); return; }
      const el = e.target as HTMLElement | null;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !el?.closest("input, textarea, select, [contenteditable='true']")) { e.preventDefault(); setCommandOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (!commandOpen) setQuery(""); }, [commandOpen]);

  const special = SPECIAL_PAGES[pathname];
  const crumbs: { icon: React.ComponentType<{ className?: string }>; text: string }[] = pathname === "/"
    ? [{ icon: Home, text: t("home") }]
    : special ? [special]
    : [active ? { icon: active.icon, text: label(active.label) } : null, current ? { icon: PAGE_ICON[current.href] ?? Dot, text: label(current.label) } : null].filter((c) => c !== null);
  // Remembered for Beranda's "Terakhir dibuka" (this browser only).
  const where = crumbs.map((c) => c.text).join(" / ");
  useEffect(() => { if (pathname !== "/" && where) rememberPage(pathname, where); }, [pathname, where]);
  if (status !== "authenticated") return <main className="min-h-screen">{children}</main>;

  const commandItems: CommandItem[] = [
    { id: "agent", label: "Tanya Agent", icon: Sparkles, group: "Aksi", keywords: ["ai", "agent", "tanya", "asisten"], onSelect: () => openAgent() },
    { id: "home", label: t("home"), icon: Home, group: "Aksi", onSelect: () => go("/") },
    { id: "notifications", label: "Notifikasi", icon: Bell, group: "Aksi", onSelect: () => go("/notifications") },
    ...modules.flatMap(({ config: mod, subPages }) => subPages.map((sub) => ({
      id: `${mod.key}:${sub.href}`, label: label(sub.label), icon: PAGE_ICON[sub.href] ?? Dot, group: label(mod.label),
      keywords: [label(mod.label), sub.href], onSelect: () => go(sub.href),
    }))),
    // Records the person may read (governed catalog search, /api/search); the query is a keyword so the list keeps them.
    ...records.map((r) => ({ id: `rec:${r.type}:${r.id}`, label: r.label, icon: FileText, group: "Record", secondary: r.type_label, keywords: [query], onSelect: () => go(r.href) })),
  ];

  return (
    <ShellContext.Provider value="crisp">
      <div data-erp-shell className="lg:mr-[var(--agent-rail,0px)]">
        <AppShell
          expandLabel={t("showMenu")}
          expandShortcut={["Ctrl", "."]}
          sidebar={(toggle) => (
            <ErpSidebar
              prefs={prefs}
              onCollapse={toggle}
              onQuickActions={() => setCommandOpen(true)}
              onSearch={() => setCommandOpen(true)}
              modules={modules.map(({ config: mod, subPages }) => ({
                key: mod.key, label: label(mod.label), icon: mod.icon,
                pages: [...subPages.filter((s) => !s.collab), ...subPages.filter((s) => s.collab)].map((s) => ({ href: s.href, label: label(s.label) })),
              }))}
              activeModule={active?.key ?? null}
              activeHref={pathname === "/" ? "/" : current?.href ?? null}
              go={go}
            />
          )}
        >
          <div data-erp-shell-header className="relative">
            <HeaderBar
              bordered
              title={
                <span className="flex min-w-0 items-center gap-1.5" data-erp-crumbs>
                  {crumbs.map((c, i) => (
                    <span key={c.text} className="flex min-w-0 items-center gap-1.5">
                      {i > 0 && <span className="text-slate-300">/</span>}
                      <c.icon className="h-4 w-4 flex-none text-slate-500" />
                      <span className="truncate">{c.text}</span>
                    </span>
                  ))}
                </span>
              }
              trailing={
                <span className="flex items-center gap-3">
                  {viewers.length > 0 && (
                    <AvatarGroup max={3} size="sm" aria-label={`Sedang di halaman ini: ${viewers.map((v) => v.name).join(", ")}`}>
                      {viewers.map((v) => (
                        <Avatar key={v.id} size="sm" title={v.self ? `${v.name} (Anda)` : v.name} style={{ background: hue(v.id), color: "#fff" }}>{initials(v.name)}</Avatar>
                      ))}
                    </AvatarGroup>
                  )}
                  {pathname !== "/" && <Button size="sm" intent="ghost" onClick={() => openAgent()}><Sparkles size={14} /> Tanya Agent</Button>}
                </span>
              }
            />
            {navigating && <div data-erp-progress aria-hidden />}
          </div>
          <main data-erp-shell-main className="min-w-0 pb-[calc(88px+env(safe-area-inset-bottom))] md:pb-6">
            <MobileContextBar />
            {/* The Agent fills this slot when opened full page (Beranda); the page beside it is hidden by CSS. */}
            <div data-agent-slot className="hidden md:contents" />
            {children}
          </main>
        </AppShell>
        <Command open={commandOpen} onOpenChange={setCommandOpen} items={commandItems} query={query} onQueryChange={setQuery} placeholder="Cari halaman, aksi, atau record…" emptyLabel={query.trim().length >= 2 ? "Tidak ada yang cocok" : "Ketik untuk mencari"} />
      </div>
    </ShellContext.Provider>
  );
}

type NavModule = { key: string; label: string; icon: React.ComponentType<{ className?: string }>; pages: { href: string; label: string }[] };

function ErpSidebar({ prefs, onCollapse, onQuickActions, onSearch, modules, activeModule, activeHref, go }: {
  prefs: UiPrefs; onCollapse: () => void; onQuickActions: () => void; onSearch: () => void; modules: NavModule[]; activeModule: string | null; activeHref: string | null; go: (href: string) => void;
}) {
  const t = useTranslations("sidebar");
  // The module you are in is open; others open and close on click, like Attio's "Automations ▸".
  const [open, setOpen] = useState<Set<string>>(new Set(activeModule ? [activeModule] : []));
  useEffect(() => { if (activeModule) setOpen((s) => new Set(s).add(activeModule)); }, [activeModule]);
  const unread = useUnreadCount();

  const row = (href: string, text: string, Icon: React.ComponentType<{ className?: string }>, trailing?: React.ReactNode, nested = false) => (
    <Link
      key={href}
      href={href}
      onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); go(href); }}
      aria-current={activeHref === href ? "page" : undefined}
      className={`erp-sb-row ${nested ? "erp-sb-row--nested" : ""}`}
    >
      <Icon className="erp-sb-icon" />
      <span className="truncate">{text}</span>
      {trailing}
    </Link>
  );

  return (
    <nav className="erp-sb" aria-label="Menu utama">
      <div className="erp-sb-head">
        <Link href="/" onClick={(e) => { e.preventDefault(); go("/"); }} className="erp-sb-brand">
          <Image src="/logo-celerates.jpg" alt="" width={22} height={22} className="rounded-md" />
          <span>Celerates</span>
        </Link>
        <button type="button" onClick={onCollapse} className="erp-sb-iconbtn" aria-label={t("hideMenu")} title={`${t("hideMenu")} (Ctrl + .)`}>
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      <div className="erp-sb-quickrow">
        <button type="button" onClick={onQuickActions} className="erp-sb-quick">
          <Kbd className="erp-sb-quick-icon">K</Kbd>
          <span>Quick Actions</span>
          <Kbd className="erp-sb-kbd">{isMac() ? "⌘K" : "Ctrl K"}</Kbd>
        </button>
        <button type="button" onClick={onSearch} className="erp-sb-quick erp-sb-search" aria-label="Cari record" title="Cari record (/)">
          <Search className="h-3.5 w-3.5" />
          <Kbd className="erp-sb-kbd">/</Kbd>
        </button>
      </div>

      <div className="erp-sb-scroll">
        {row("/", t("home"), Home)}
        {row("/notifications", "Notifikasi", Bell, unread > 0 ? <span className="erp-sb-count">{unread > 99 ? "99+" : unread}</span> : undefined)}

        <p className="erp-sb-section">Modul</p>
        {modules.map((m) => {
          const expanded = open.has(m.key);
          return (
            <div key={m.key}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(m.key)) n.delete(m.key); else n.add(m.key); return n; })}
                className={`erp-sb-row ${activeModule === m.key ? "erp-sb-row--module-active" : ""}`}
              >
                <m.icon className="erp-sb-icon" />
                <span className="truncate">{m.label}</span>
                <ChevronRight className={`erp-sb-chev ${expanded ? "rotate-90" : ""}`} />
              </button>
              {expanded && (
                <div className="erp-sb-children">
                  {m.pages.map((p) => row(p.href, p.label, PAGE_ICON[p.href] ?? Dot, undefined, true))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="erp-sb-foot">
        <ProfileMenu prefs={prefs} />
      </div>
    </nav>
  );
}

/** Pages outside the modules, named in the header. */
const SPECIAL_PAGES: Record<string, { icon: React.ComponentType<{ className?: string }>; text: string }> = {
  "/notifications": { icon: Bell, text: "Inbox" },
  "/profile": { icon: UserRound, text: "Profil" },
  "/activity-log": { icon: History, text: "Log aktivitas" },
  "/access-management": { icon: KeyRound, text: "Manajemen akses" },
};
const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const initials = (name: string) => name.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
/** A steady colour per person, so the same face reads the same everywhere. */
const hue = (id: string) => `hsl(${[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 45% 45%)`;

export const RECENT_KEY = "celerates.recent";
export const NOTIFICATIONS_CHANGED = "celerates:notifications-changed";
function rememberPage(href: string, label: string) {
  try {
    const list = (JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as { href: string; label: string; at: number }[]).filter((p) => p.href !== href);
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ href, label, at: Date.now() }, ...list].slice(0, 8)));
  } catch { /* storage blocked: Beranda shows nothing recent */ }
}

type RecordHit = { type: string; type_label: string; id: string; label: string; href: string };
function useRecordSearch(raw: string) {
  const [hits, setHits] = useState<RecordHit[]>([]);
  const q = raw.trim();
  useEffect(() => {
    if (q.length < 2) { setHits([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: "no-store", signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((body: { results?: RecordHit[] }) => setHits((body.results ?? []).slice(0, 8)))
        .catch(() => {});
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [q]);
  return hits;
}

type Viewer = { id: string; name: string; self: boolean };
/** Who has this page open (Attio's avatars, QA page 23): a heartbeat every 20 s while the tab is visible. */
function usePresence(path: string | null) {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  useEffect(() => {
    setViewers([]);
    if (!path) return;
    let alive = true;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }), cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { viewers: [] }))
        .then((body: { viewers?: Viewer[] }) => { if (alive) setViewers(body.viewers ?? []); })
        .catch(() => {});
    };
    beat();
    const id = window.setInterval(beat, 20_000);
    document.addEventListener("visibilitychange", beat);
    return () => { alive = false; window.clearInterval(id); document.removeEventListener("visibilitychange", beat); };
  }, [path]);
  return viewers;
}

function useUnreadCount() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => getMyNotifications().then((rows) => { if (alive) setN((rows as { is_read: boolean }[]).filter((r) => !r.is_read).length); }).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    window.addEventListener(NOTIFICATIONS_CHANGED, load); // the Inbox marked something read
    return () => { alive = false; clearInterval(id); window.removeEventListener(NOTIFICATIONS_CHANGED, load); };
  }, []);
  return n;
}

function ProfileMenu({ prefs }: { prefs: UiPrefs }) {
  const { data: session } = useSession();
  const router = useRouter();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);
  const user = (session?.user ?? {}) as { fullName?: string; name?: string; email?: string; isOwner?: boolean; access?: { divisionKey: string; level: string }[] };
  const name = user.fullName ?? user.name ?? user.email ?? "";
  const role = user.isOwner ? "Owner" : user.access?.[0] ? `${user.access[0].divisionKey.toUpperCase()} · ${user.access[0].level}` : "Celerates";
  const pref = <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => start(async () => { await setUiPreference(key, value); setOpen(false); router.refresh(); });
  const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-100";

  return (
    <div ref={ref} className="relative">
      {open && (
        <div role="menu" className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-slate-200 bg-white p-1 shadow-[0_8px_24px_rgba(15,23,42,0.14)]">
          <p className="truncate px-2 pb-1 pt-1.5 text-[11px] text-slate-500">{user.email}</p>
          <Link href="/profile" className={item} onClick={() => setOpen(false)}><UserRound className="h-4 w-4" /> Edit profil</Link>
          <Link href="/activity-log" className={item} onClick={() => setOpen(false)}><History className="h-4 w-4" /> Log aktivitas</Link>
          {user.isOwner && <Link href="/access-management" className={item} onClick={() => setOpen(false)}><KeyRound className="h-4 w-4" /> Manajemen akses</Link>}
          <div className="my-1 border-t border-slate-100" />
          <div className="flex items-center justify-between px-2 py-1.5 text-[13px] text-slate-700">
            <span>Bahasa</span>
            <span className="flex gap-1">
              {(["id", "en"] as const).map((l) => (
                <button key={l} type="button" onClick={() => start(async () => { await setLocale(l); router.refresh(); })}
                  className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${locale === l ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{l.toUpperCase()}</button>
              ))}
            </span>
          </div>
          <button type="button" className={item} onClick={() => pref("sidebar", prefs.sidebar === "dark" ? "light" : "dark")}>
            {prefs.sidebar === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {prefs.sidebar === "dark" ? "Sidebar terang" : "Sidebar gelap"}
          </button>
          <button type="button" className={item} onClick={() => pref("look", prefs.look === "hybrid" ? "v1" : "hybrid")}>
            <LayoutTemplate className="h-4 w-4" /> {prefs.look === "hybrid" ? "Tampilan halaman: saat ini" : "Tampilan halaman: Hybrid"}
          </button>
          <button type="button" className={item} onClick={() => pref("shell", "classic")}><Undo2 className="h-4 w-4" /> Kembali ke tampilan lama</button>
          <div className="my-1 border-t border-slate-100" />
          <button type="button" className={`${item} text-red-600 hover:bg-red-50`} onClick={() => signOut({ callbackUrl: "/login" })}><LogOut className="h-4 w-4" /> Keluar</button>
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="erp-sb-profile">
        <span className="erp-sb-avatar">{name.charAt(0).toUpperCase() || "?"}</span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13px] font-medium">{name}</span>
          <span className="erp-sb-ai-sub block truncate">{role}</span>
        </span>
      </button>
    </div>
  );
}
