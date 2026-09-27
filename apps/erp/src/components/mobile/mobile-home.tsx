"use client";
// Mobile Beranda (doc 18 §12), Jernih. Every module tile comes from the registry filtered by the user's
// authority; Perlu perhatian and Terbaru are existing deterministic ERP data (signals, notifications).
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Bell, Camera, ChevronRight, LayoutGrid, Mic, Search } from "lucide-react";
import type { ResolvedModule } from "@/lib/module-access";
import { useMobileData } from "./data";
import { openAgent } from "./events";
import { ModuleLandingSheet, ModuleTile, useOpenModules } from "./modules";
import { Card, SectionHeader } from "./primitives";
import { ACCOUNT_OPEN_EVENT } from "./events";
import { timeAgo } from "./time";

export function MobileHome() {
  const t = useTranslations("mobile");
  const { data: session } = useSession();
  const modules = useOpenModules();
  const { signals, notifications, unread } = useMobileData();
  const [landing, setLanding] = useState<ResolvedModule | null>(null);
  const [part, setPart] = useState<"morning" | "afternoon" | "evening" | null>(null);
  useEffect(() => {
    const h = new Date().getHours();
    setPart(h < 11 ? "morning" : h < 15 ? "afternoon" : "evening");
  }, []);

  const user = session?.user as { fullName?: string; name?: string; isOwner?: boolean } | undefined;
  const first = (user?.fullName ?? user?.name ?? "").split(" ")[0];
  const business = modules.filter((m) => m.group === "bisnis");
  // Beranda launches the business modules; the full directory (operational modules too) is one tap away.
  const launcher = business.length ? business : modules.filter((m) => m.group === "operasional");
  const perModule = useMemo(() => {
    const out: Record<string, number> = {};
    for (const g of signals ?? []) if (g.count > 0) out[g.module] = (out[g.module] ?? 0) + g.count;
    return out;
  }, [signals]);
  const attention = (signals ?? []).filter((g) => g.count > 0);

  return (
    <div className="min-h-[100dvh] bg-j-bg font-jakarta text-j-ink" data-mobile-home>
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-5 pb-[calc(104px+env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/icons/icon-192.png" alt="" width={34} height={34} className="rounded-[10px] border border-j-line bg-white" />
            <span className="text-[19px] font-extrabold tracking-[-0.3px]">Celerates</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Link href="/notifications" aria-label={t("notificationsLabel", { count: unread })} className="relative flex h-11 w-11 items-center justify-center rounded-full border border-j-line bg-j-surface">
              <Bell aria-hidden className="h-5 w-5" strokeWidth={1.9} />
              {unread > 0 && <span className="absolute right-2.5 top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-j-danger" />}
            </Link>
            <button
              type="button"
              aria-label={t("accountLabel")}
              onClick={() => window.dispatchEvent(new CustomEvent(ACCOUNT_OPEN_EVENT))}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#dde5f7] text-sm font-extrabold text-j-accent-strong"
            >
              {(first || "?").charAt(0).toUpperCase()}
            </button>
          </div>
        </header>

        <section className="flex flex-col gap-1">
          <h1 className="text-[27px] font-extrabold leading-[1.15] tracking-[-0.6px]">{part ? t(`greeting.${part}`, { name: first }) : t("greeting.plain", { name: first })}</h1>
          <p className="text-sm text-j-muted">{user?.isOwner ? t("roleOwner") : t("roleModules", { count: modules.length })}</p>
        </section>

        <div className="flex h-[54px] items-center gap-2.5 rounded-2xl border border-[#e1e6ef] bg-j-surface pl-3.5 pr-2 shadow-j-card">
          <button type="button" onClick={openAgent} className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left text-[15px] text-j-muted" data-home-ask>
            <Search aria-hidden className="h-5 w-5 shrink-0" strokeWidth={1.9} />
            <span className="truncate">{t("askPlaceholder")}</span>
          </button>
          <Link href="/files" aria-label={t("capture")} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1f4f9] text-j-ink">
            <Camera aria-hidden className="h-5 w-5" strokeWidth={1.9} />
          </Link>
          <button type="button" onClick={openAgent} aria-label={t("voice")} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1f4f9] text-j-ink">
            <Mic aria-hidden className="h-5 w-5" strokeWidth={1.9} />
          </button>
        </div>

        {launcher.length > 0 && (
          <section aria-labelledby="home-launcher" className="flex flex-col gap-2.5">
            <SectionHeader id="home-launcher" title={business.length ? t("groupBusiness") : t("groupOperational")} />
            <div className="grid grid-cols-4 gap-2.5">
              {launcher.map((m) => (
                <ModuleTile key={m.key} module={m} signal={perModule[m.key]} onOpen={() => setLanding(m)} />
              ))}
              <Link href="/modules" data-module-tile="all" className="flex min-h-[90px] flex-col items-center justify-center gap-1.5 rounded-j-card border border-j-line bg-j-surface px-1 py-2.5 text-center text-xs font-semibold leading-tight text-j-ink shadow-j-card">
                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-[#eef1f5] text-[#3f4a5c]">
                  <LayoutGrid aria-hidden className="h-[21px] w-[21px]" strokeWidth={1.9} />
                </span>
                {t("allModules")}
              </Link>
            </div>
          </section>
        )}
        {attention.length > 0 && (
          <button type="button" onClick={openAgent} data-home-attention className="flex items-center gap-3 rounded-j-card border border-j-warn-line bg-j-warn-soft px-3.5 py-3 text-left text-j-ink">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-j-warn-dot text-sm font-extrabold text-white">{attention.reduce((n, g) => n + g.count, 0)}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-bold">{t("attentionTitle", { count: attention.length })}</span>
              <span className="truncate text-xs text-j-warn-ink">{attention.slice(0, 2).map((g) => g.title).join(" · ")}</span>
            </span>
            <ChevronRight aria-hidden className="h-[18px] w-[18px] text-j-warn-ink" />
          </button>
        )}

        {modules.length === 0 && <Card className="p-4 text-sm text-j-muted">{t("noModules")}</Card>}

        <section aria-labelledby="home-recent" className="flex flex-col gap-2">
          <SectionHeader id="home-recent" title={t("recent")} action={<Link href="/notifications" className="text-[13px] font-semibold text-j-accent">{t("seeAll")}</Link>} />
          <Card className="px-3.5 py-1">
            {notifications === null ? (
              <p className="py-3 text-sm text-j-muted">{t("loading")}</p>
            ) : notifications.length === 0 ? (
              <p className="py-3 text-sm text-j-muted">{t("recentEmpty")}</p>
            ) : (
              <ul className="divide-y divide-j-line-soft">
                {notifications.slice(0, 3).map((n) => (
                  <li key={n.id}>
                    <Link href={n.link ?? "/notifications"} className="flex items-center gap-3 py-3">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${n.is_read ? "bg-[#c5ccd8]" : "bg-j-accent"}`} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[13px] leading-snug">{n.title}</span>
                      <span className="whitespace-nowrap text-xs text-j-muted">{timeAgo(n.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
      <ModuleLandingSheet module={landing} signals={signals ?? []} onClose={() => setLanding(null)} />
    </div>
  );
}
