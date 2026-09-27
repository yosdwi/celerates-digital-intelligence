"use client";
// Mobile navigation foundation (doc 18 §12): Beranda · Modul · Agent · Tinjau · Akun, below `md` only.
// The desktop sidebar and its corner controls are untouched at `md` and above.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { signOut, useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Activity, Home, Inbox, LayoutGrid, LogOut, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { setLocale } from "@/lib/locale-actions";
import { isMobileNative, moduleForPath } from "@/lib/module-access";
import { useMobileData } from "./data";
import { ACCOUNT_OPEN_EVENT, openAgent } from "./events";
import { ModuleGlyph, ModuleLandingSheet, useModuleLabel, useOpenModules } from "./modules";
import { BottomSheet, Row, RowList } from "./primitives";

const HIDDEN_ON = ["/login", "/setup", "/register", "/pending-approval", "/onboarding-profile"];

export function MobileTabBar() {
  const t = useTranslations("mobile");
  const { status } = useSession();
  const pathname = usePathname();
  const { unread } = useMobileData();
  const [account, setAccount] = useState(false);
  useEffect(() => {
    const open = () => setAccount(true);
    window.addEventListener(ACCOUNT_OPEN_EVENT, open);
    return () => window.removeEventListener(ACCOUNT_OPEN_EVENT, open);
  }, []);
  useEffect(() => setAccount(false), [pathname]);
  if (status !== "authenticated" || HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;

  const active = pathname === "/" ? "home" : pathname === "/notifications" ? "review" : pathname === "/profile" ? "account" : "modules";
  const item = "relative flex min-h-[56px] flex-col items-center justify-start gap-1 pt-1 text-[11px]";
  const tone = (key: string) => (active === key ? "font-bold text-j-accent" : "font-semibold text-j-muted");
  return (
    <>
      <nav
        aria-label={t("navLabel")}
        data-mobile-tabbar
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-j-line bg-j-surface px-1.5 pb-[env(safe-area-inset-bottom)] pt-2 font-jakarta md:hidden"
      >
        <Link href="/" aria-current={active === "home" ? "page" : undefined} className={`${item} ${tone("home")}`}>
          <Home aria-hidden className="h-6 w-6" strokeWidth={1.9} fill={active === "home" ? "#e8eefd" : "none"} />
          {t("tabs.home")}
        </Link>
        <Link href="/modules" aria-current={active === "modules" ? "page" : undefined} className={`${item} ${tone("modules")}`}>
          <LayoutGrid aria-hidden className="h-6 w-6" strokeWidth={1.9} fill={active === "modules" ? "#e8eefd" : "none"} />
          {t("tabs.modules")}
        </Link>
        <button type="button" onClick={openAgent} data-tab-agent className={`${item} gap-0.5 font-semibold text-j-muted`}>
          <span className="-mt-6 flex h-[52px] w-[52px] items-center justify-center rounded-[18px] border-4 border-j-bg bg-j-accent text-white shadow-j-raise">
            <Sparkles aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.9} />
          </span>
          {t("tabs.agent")}
        </button>
        <Link href="/notifications" aria-current={active === "review" ? "page" : undefined} className={`${item} ${tone("review")}`}>
          <Inbox aria-hidden className="h-6 w-6" strokeWidth={1.9} fill={active === "review" ? "#e8eefd" : "none"} />
          {t("tabs.review")}
          {unread > 0 && (
            <span aria-label={t("unread", { count: unread })} className="absolute left-1/2 top-0 ml-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-j-danger px-1 text-[10px] font-extrabold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
        <button type="button" onClick={() => setAccount(true)} className={`${item} ${tone("account")}`}>
          <UserRound aria-hidden className="h-6 w-6" strokeWidth={1.9} />
          {t("tabs.account")}
        </button>
      </nav>
      <AccountSheet open={account} onClose={() => setAccount(false)} />
    </>
  );
}

function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("mobile");
  const { data } = useSession();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const user = (data?.user ?? {}) as { fullName?: string; name?: string; email?: string; isOwner?: boolean };
  const close = useCallback(() => onClose(), [onClose]);
  return (
    <BottomSheet open={open} onClose={close} title={t("tabs.account")}>
      <div className="flex flex-col gap-4 pb-2" data-account-sheet>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#dde5f7] text-base font-extrabold text-j-accent-strong">{(user.fullName ?? user.name ?? "?").charAt(0).toUpperCase()}</span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{user.fullName ?? user.name}</p>
            <p className="truncate text-sm text-j-muted">{user.email}{user.isOwner ? ` · ${t("owner")}` : ""}</p>
          </div>
        </div>
        <RowList>
          <Row href="/profile" leading={<UserRound aria-hidden className="h-5 w-5 text-j-muted" />} title={t("profile")} />
          <Row href="/activity-log" leading={<Activity aria-hidden className="h-5 w-5 text-j-muted" />} title={t("activityLog")} />
          {user.isOwner && <Row href="/access-management" leading={<ShieldCheck aria-hidden className="h-5 w-5 text-j-muted" />} title={t("accessManagement")} />}
        </RowList>
        <div role="group" aria-label={t("language")} className="grid grid-cols-2 gap-1 rounded-2xl bg-j-field p-1">
          {(["id", "en"] as const).map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={locale === code}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await setLocale(code);
                  router.refresh();
                })
              }
              className={`h-10 rounded-xl text-sm font-bold ${locale === code ? "bg-j-surface text-j-ink shadow-j-card" : "text-j-muted"}`}
            >
              {code === "id" ? "Bahasa Indonesia" : "English"}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="flex h-12 items-center justify-center gap-2 rounded-[14px] border border-[#f3c7c2] text-[15px] font-bold text-[#b3261e]">
          <LogOut aria-hidden className="h-5 w-5" /> {t("logout")}
        </button>
      </div>
    </BottomSheet>
  );
}

/** On a module's desktop page shown on a phone: which module you are in, and its landing sheet. */
export function MobileContextBar() {
  const t = useTranslations("mobile");
  const pathname = usePathname();
  const { status } = useSession();
  const modules = useOpenModules();
  const { signals } = useMobileData();
  const label = useModuleLabel();
  const [open, setOpen] = useState(false);
  const current = useMemo(() => {
    const config = moduleForPath(pathname);
    return config ? modules.find((m) => m.key === config.key) ?? null : null;
  }, [pathname, modules]);
  useEffect(() => setOpen(false), [pathname]);
  if (status !== "authenticated" || !current || isMobileNative(pathname)) return null;
  const sub = current.subPages.find((s) => s.href === pathname);
  return (
    <>
      <div className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-j-line bg-j-surface/95 px-4 py-2 pt-[max(8px,env(safe-area-inset-top))] font-jakarta text-j-ink backdrop-blur md:hidden" data-mobile-context={current.key}>
        <ModuleGlyph module={current} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-bold">{label(current.config.label)}</span>
          {sub && <span className="truncate text-xs text-j-muted">{label(sub.label)}</span>}
        </span>
        <button type="button" onClick={() => setOpen(true)} className="h-10 rounded-xl border border-j-line px-3 text-[13px] font-bold text-j-accent">
          {t("submodules")}
        </button>
      </div>
      {open && <ModuleLandingSheet module={current} signals={signals ?? []} onClose={() => setOpen(false)} />}
    </>
  );
}
