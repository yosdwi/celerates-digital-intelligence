"use client";
// Frontend Lab Home: RBAC shapes the workspace directly. A single-role user sees that role's capabilities
// instead of tapping a division tile first; Owner/multi-role users keep the registry-driven module launcher.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  Bell,
  Camera,
  CircleCheckBig,
  ClipboardList,
  Clock3,
  FileSignature,
  FolderOpen,
  LayoutGrid,
  Mic,
  Plane,
  ReceiptText,
  Search,
  UsersRound,
} from "lucide-react";
import type { ResolvedModule } from "@/lib/module-access";
import { CaptureSheet } from "./capture";
import { useMobileData } from "./data";
import { openAgent } from "./events";
import { ModuleLandingSheet, ModuleTile, TINTS, useModuleLabel, useOpenModules } from "./modules";
import { Card, SectionHeader } from "./primitives";
import { ACCOUNT_OPEN_EVENT } from "./events";
import { timeAgo } from "./time";

function capabilityLabel(label: string): string {
  if (label === "Talent Document Tracker") return "Documents";
  if (label === "Operational Readiness") return "Readiness";
  if (label === "Overtime & Business Trip") return "Overtime & Trip";
  return label;
}

function CapabilityGlyph({ href, label, tint }: { href: string; label: string; tint: string }) {
  const text = `${href} ${label}`.toLowerCase();
  const Icon = text.includes("contract")
    ? FileSignature
    : text.includes("invoice")
      ? ReceiptText
      : text.includes("readiness")
        ? CircleCheckBig
        : text.includes("overtime") || text.includes("trip")
          ? Plane
          : text.includes("document")
            ? FolderOpen
            : text.includes("attendance") || text.includes("time")
              ? Clock3
              : text.includes("employee") || text.includes("candidate") || text.includes("talent")
                ? UsersRound
                : ClipboardList;

  return (
    <span className={`flex h-12 w-12 items-center justify-center rounded-[16px] ${tint}`}>
      <Icon aria-hidden className="h-[23px] w-[23px]" strokeWidth={1.85} />
    </span>
  );
}

export function MobileHome() {
  const t = useTranslations("mobile");
  const { data: session, status } = useSession();
  const modules = useOpenModules();
  const label = useModuleLabel();
  const { signals, notifications, unread } = useMobileData();
  const [landing, setLanding] = useState<ResolvedModule | null>(null);
  const [capture, setCapture] = useState(false);
  const [part, setPart] = useState<"morning" | "afternoon" | "evening" | null>(null);

  useEffect(() => {
    const h = new Date().getHours();
    setPart(h < 11 ? "morning" : h < 15 ? "afternoon" : "evening");
  }, []);

  const user = session?.user as { fullName?: string; name?: string; isOwner?: boolean } | undefined;
  const fullName = user?.fullName ?? user?.name ?? "";
  const first = fullName.split(" ")[0];
  const business = modules.filter((m) => m.group === "bisnis");
  const workspace = business.length === 1 ? business[0] : null;
  const launcher = business.length ? business : modules.filter((m) => m.group === "operasional");

  const workspaceCapabilities = useMemo(() => {
    if (!workspace) return [];
    const base = workspace.config.basePath;
    return workspace.config.subPages.filter((sub) => {
      const isDashboard = sub.href === `${base}/dashboard`;
      const isOwnedPath = sub.href === base || sub.href.startsWith(`${base}/`);
      return !isDashboard && isOwnedPath;
    });
  }, [workspace]);

  const perModule = useMemo(() => {
    const out: Record<string, number> = {};
    for (const g of signals ?? []) if (g.count > 0) out[g.module] = (out[g.module] ?? 0) + g.count;
    return out;
  }, [signals]);

  const workspaceName = workspace ? label(workspace.config.label) : null;
  const searchText = workspaceName ? `Cari di ${workspaceName}` : t("askPlaceholder");
  const workspaceTint = workspace ? (TINTS[workspace.key] ?? TINTS.executive) : TINTS.executive;

  return (
    <div className="min-h-[100dvh] bg-j-bg font-jakarta text-j-ink" data-mobile-home>
      <div className="mx-auto flex max-w-xl flex-col gap-5 px-5 pb-[calc(104px+env(safe-area-inset-bottom))] pt-[max(18px,env(safe-area-inset-top))]">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0 pt-0.5">
            <p className="text-[14px] font-medium text-j-muted">
              {part ? t(`greeting.${part}`, { name: first }) : t("greeting.plain", { name: first })}
            </p>
            <h1 className="mt-0.5 truncate text-[23px] font-extrabold leading-[1.18] tracking-[-0.45px]">
              {fullName || first || "Celerates"}
            </h1>
            <p className="mt-1 text-[12px] font-semibold text-j-muted">
              {workspaceName ?? (user?.isOwner ? t("roleOwner") : t("roleModules", { count: modules.length }))}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <Link
              href="/notifications"
              aria-label={t("notificationsLabel", { count: unread })}
              className="relative flex h-11 w-11 items-center justify-center rounded-full border border-j-line bg-j-surface shadow-j-card"
            >
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

        <div className="flex h-[54px] items-center gap-2.5 rounded-2xl border border-[#e1e6ef] bg-j-surface pl-3.5 pr-2 shadow-j-card">
          <Link href="/search" className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left text-[15px] text-j-muted" data-home-search>
            <Search aria-hidden className="h-5 w-5 shrink-0" strokeWidth={1.9} />
            <span className="truncate">{searchText}</span>
          </Link>
          <button type="button" onClick={() => setCapture(true)} aria-label={t("capture")} data-home-capture className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1f4f9] text-j-ink">
            <Camera aria-hidden className="h-5 w-5" strokeWidth={1.9} />
          </button>
          <button type="button" onClick={openAgent} aria-label={t("voice")} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1f4f9] text-j-ink">
            <Mic aria-hidden className="h-5 w-5" strokeWidth={1.9} />
          </button>
        </div>

        {workspace && workspaceCapabilities.length > 0 ? (
          <section aria-labelledby="home-workspace" className="flex flex-col gap-2.5" data-home-workspace={workspace.key}>
            <SectionHeader id="home-workspace" title={workspaceName ?? workspace.config.label} />
            <div className="grid grid-cols-3 gap-x-2 gap-y-5 rounded-[24px] border border-j-line bg-j-surface px-3 py-5 shadow-j-card">
              {workspaceCapabilities.map((sub) => {
                const shortLabel = capabilityLabel(label(sub.label));
                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    data-workspace-capability={sub.href}
                    className="flex min-h-[84px] min-w-0 flex-col items-center justify-start gap-2 px-1 text-center text-[12px] font-semibold leading-[1.2] text-j-ink"
                  >
                    <CapabilityGlyph href={sub.href} label={shortLabel} tint={workspaceTint} />
                    <span className="line-clamp-2 max-w-[92px]">{shortLabel}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : launcher.length > 0 ? (
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
        ) : null}

        {status === "authenticated" && modules.length === 0 && <Card className="p-4 text-sm text-j-muted">{t("noModules")}</Card>}

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
      <CaptureSheet open={capture} onClose={() => setCapture(false)} />
    </div>
  );
}
