"use client";
// Tinjau (doc 18 §17): what is waiting for *my* decision, oldest first, grouped by the kind of decision. Each item
// opens the record where the decision is taken; nothing is decided from the list except a timesheet approval,
// which has no record page of its own and uses the existing timesheet server action.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BellRing, CalendarDays, ClipboardCheck, CheckCircle2, ChevronRight, Clock3, FileSignature, Landmark, Sparkles, UserRound } from "lucide-react";
import { approveTimesheetSubmission } from "@/app/timesheet/actions";
import type { ReviewItem, ReviewKind } from "@/lib/review/queue";
import { fmtDate } from "@/lib/pmo/mobile-format";
import { useMobileData } from "../data";
import { BottomSheet, Card, FactRows, MobileScreen, ScreenTitle, SectionHeader, StatusPill, type Tone } from "../primitives";
import { buttonClass } from "../styles";
import { timeAgo } from "../time";

type Group = "all" | "sign" | "time_off" | "timesheet" | "finance" | "readiness" | "agent";
const GROUP_OF: Record<ReviewKind, Group> = { signature: "sign", time_off: "time_off", timesheet: "timesheet", finance_verify: "finance", finance_revise: "finance", proposal: "agent", correction: "readiness", campaign: "readiness" };
const TONE: Record<ReviewKind, Tone> = { signature: "accent", time_off: "accent", timesheet: "accent", finance_verify: "accent", finance_revise: "danger", proposal: "warn", correction: "accent", campaign: "warn" };
const ICON: Record<ReviewKind, typeof FileSignature> = { signature: FileSignature, time_off: CalendarDays, timesheet: Clock3, finance_verify: Landmark, finance_revise: Landmark, proposal: Sparkles, correction: ClipboardCheck, campaign: BellRing };

export function ReviewQueue({ items, initialOpen, conformUnavailable }: { items: ReviewItem[]; initialOpen?: string | null; conformUnavailable?: boolean }) {
  const t = useTranslations("mobile.review");
  const tm = useTranslations("mobile");
  const locale = useLocale();
  const { notifications, refresh } = useMobileData();
  const [group, setGroup] = useState<Group>("all");
  const [sheet, setSheet] = useState<ReviewItem | null>(null);
  useEffect(() => {
    if (initialOpen) setSheet(items.find((i) => i.key === initialOpen) ?? null);
  }, [initialOpen, items]);

  const counts = useMemo(() => {
    const c: Partial<Record<Group, number>> = { all: items.length };
    for (const i of items) c[GROUP_OF[i.kind]] = (c[GROUP_OF[i.kind]] ?? 0) + 1;
    return c;
  }, [items]);
  const groups = (["all", "sign", "time_off", "timesheet", "finance", "readiness", "agent"] as Group[]).filter((g) => g === "all" || counts[g]);
  const shown = group === "all" ? items : items.filter((i) => GROUP_OF[i.kind] === group);
  const period = (i: ReviewItem) =>
    !i.meta.start ? null : i.meta.end ? `${fmtDate(String(i.meta.start), locale)} – ${fmtDate(String(i.meta.end), locale)}` : fmtDate(String(i.meta.start), locale);
  const subtitle = (i: ReviewItem) => {
    if (i.kind === "signature") return [i.meta.extension ? t("extensionShort") : null, i.meta.step ? t("steps." + i.meta.step) : null].filter(Boolean).join(" · ") || null;
    if (i.kind === "proposal") return t("proposalItems", { count: Number(i.meta.items ?? 0) });
    if (i.kind === "correction") return t(`correctionType.${String(i.meta.type)}`);
    if (i.kind === "campaign") return t("campaignRecipients", { count: Number(i.meta.recipients ?? 0) });
    if (i.kind === "finance_revise") return (i.meta.notes as string | null) ?? i.subtitle;
    return i.subtitle;
  };

  return (
    <MobileScreen label={tm("tabs.review")}>
      <div data-review-queue className="flex flex-col gap-4">
        <ScreenTitle title={tm("tabs.review")} subtitle={items.length ? t("waiting", { count: items.length }) : t("subtitle")} />
        {conformUnavailable && <Card className="p-3 text-[0.8125rem] text-[#8a4b06]" data-conform-unavailable>{t("conformUnavailable")}</Card>}
        {groups.length > 1 && (
          <div role="tablist" aria-label={t("filter")} className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                role="tab"
                aria-selected={group === g}
                data-review-group={g}
                onClick={() => setGroup(g)}
                className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[0.8125rem] ${group === g ? "bg-j-ink font-bold text-white" : "border border-j-line bg-j-surface font-semibold text-j-muted"}`}
              >
                {t("groups." + g)}
                <span className={group === g ? "text-white/70" : "text-j-faint"}>{counts[g]}</span>
              </button>
            ))}
          </div>
        )}

        {shown.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 px-4 py-8 text-center" data-review-empty>
            <CheckCircle2 aria-hidden className="h-8 w-8 text-j-ok" />
            <p className="text-[0.9375rem] font-bold">{t("emptyTitle")}</p>
            <p className="text-sm text-j-muted">{t("emptyBody")}</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {shown.map((i) => {
              const Icon = ICON[i.kind];
              const body = (
                <>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${i.kind === "finance_revise" ? "bg-[#fde8e6] text-[#a8261c]" : "bg-j-accent-soft text-j-accent"}`}>
                    <Icon aria-hidden className="h-5 w-5" strokeWidth={1.9} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-bold tracking-[0.2px] text-j-muted">{t("kinds." + i.kind)}</span>
                      <StatusPill tone={TONE[i.kind]}>{t("actions." + i.kind)}</StatusPill>
                    </span>
                    <span className="truncate text-[0.9375rem] font-bold">{i.title}</span>
                    {subtitle(i) && <span className="line-clamp-2 text-[0.8125rem] text-j-muted">{subtitle(i)}</span>}
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-j-muted">
                      {i.requester && (
                        <span className="flex items-center gap-1">
                          <UserRound aria-hidden className="h-3.5 w-3.5" />
                          {i.requester}
                        </span>
                      )}
                      {period(i) && <span>{period(i)}</span>}
                      <span>{t("since", { ago: timeAgo(i.since, locale) })}</span>
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="mt-3 h-4 w-4 shrink-0 text-j-faint" />
                </>
              );
              const cls = "flex w-full items-start gap-3 rounded-j-card border border-j-line bg-j-surface p-3.5 text-left text-j-ink shadow-j-card";
              return (
                <li key={i.key} data-review-item={i.kind}>
                  {i.kind === "timesheet" ? (
                    <button type="button" onClick={() => setSheet(i)} className={cls}>
                      {body}
                    </button>
                  ) : (
                    <Link href={i.href} className={cls}>
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <section aria-labelledby="review-updates" className="flex flex-col gap-2">
          <SectionHeader id="review-updates" title={t("updates")} action={<Link href="/notifications" className="text-[0.8125rem] font-semibold text-j-accent">{tm("seeAll")}</Link>} />
          <Card className="px-3.5 py-1">
            {notifications === null ? (
              <p className="py-3 text-sm text-j-muted">{tm("loading")}</p>
            ) : notifications.length === 0 ? (
              <p className="py-3 text-sm text-j-muted">{tm("recentEmpty")}</p>
            ) : (
              <ul className="divide-y divide-j-line-soft">
                {notifications.slice(0, 4).map((n) => (
                  <li key={n.id}>
                    <Link href={n.link ?? "/notifications"} className="flex items-center gap-3 py-3">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${n.is_read ? "bg-[#c5ccd8]" : "bg-j-accent"}`} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[0.8125rem] leading-snug">{n.title}</span>
                      <span className="whitespace-nowrap text-xs text-j-muted">{timeAgo(n.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
      <TimesheetSheet item={sheet} onClose={() => setSheet(null)} onDone={refresh} />
    </MobileScreen>
  );
}

function TimesheetSheet({ item, onClose, onDone }: { item: ReviewItem | null; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("mobile.review");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!item) return null;
  const approve = () =>
    start(async () => {
      setError(null);
      const result = await approveTimesheetSubmission(item.id);
      if (!result.ok) return setError(result.error);
      onClose();
      onDone();
      router.replace("/review");
      router.refresh();
    });
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t("kinds.timesheet")}
      footer={
        <>
          <Link href="/timesheet" className={buttonClass.secondary}>
            {t("openTimesheet")}
          </Link>
          <button type="button" onClick={approve} disabled={pending} data-action="approve-timesheet" className={buttonClass.primary}>
            {pending ? "…" : t("approve")}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 pb-1">
        <FactRows
          rows={[
            { label: t("talent"), value: item.title },
            { label: t("client"), value: item.subtitle ?? "—" },
            { label: t("period"), value: `${fmtDate(String(item.meta.start), locale)} – ${fmtDate(String(item.meta.end), locale)}` },
          ]}
        />
        {error && <p role="alert" className="text-sm font-semibold text-[#a8261c]">{error}</p>}
      </div>
    </BottomSheet>
  );
}
