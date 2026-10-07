"use client";
// Mobile operational list (doc 18 §16): the replacement for a desktop table. Search, status tabs that double as
// the compact summary, sort in a bottom sheet, and cards that open a full-screen record. Items arrive already
// shaped by the server, so every module can reuse this without a render prop crossing the server boundary.
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, FileText, Search, SlidersHorizontal, Users, Wallet } from "lucide-react";
import { BottomSheet, Card, StatusPill } from "./primitives";

import type { Tone } from "./primitives";
export type { Tone };
const ICONS = { calendar: CalendarDays, users: Users, clock: Clock, file: FileText, check: CheckCircle2, alert: AlertTriangle, wallet: Wallet } as const;
export type FactIcon = keyof typeof ICONS;

export type ListItem = {
  id: string;
  href: string;
  eyebrow?: string | null;
  title: string;
  subtitle?: string | null;
  facts: { icon?: FactIcon; text: string; tone?: Tone }[];
  status?: { label: string; tone: Tone } | null;
  flag?: { label: string; tone: Tone } | null;
  search: string;
  tabs: string[];
  sort: Record<string, string | number | null>;
};

export function FilterableList({
  items,
  tabs,
  sorts,
  initialQuery = "",
  label,
}: {
  items: ListItem[];
  tabs: { key: string; label: string }[];
  sorts: { key: string; label: string; dir: "asc" | "desc" }[];
  initialQuery?: string;
  label: string;
}) {
  const t = useTranslations("mobile.list");
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState(tabs[0]?.key ?? "all");
  const [sort, setSort] = useState(sorts[0]?.key ?? "");
  const [sheet, setSheet] = useState(false);
  const counts = useMemo(() => Object.fromEntries(tabs.map((x) => [x.key, items.filter((i) => x.key === "all" || i.tabs.includes(x.key)).length])), [items, tabs]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const spec = sorts.find((s) => s.key === sort);
    const out = items.filter((i) => (tab === "all" || i.tabs.includes(tab)) && (!q || q.split(/\s+/).every((w) => i.search.includes(w))));
    if (spec)
      out.sort((a, b) => {
        const x = a.sort[spec.key];
        const y = b.sort[spec.key];
        if (x === y) return 0;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (x < y ? -1 : 1) * (spec.dir === "asc" ? 1 : -1);
      });
    return out;
  }, [items, query, tab, sort, sorts]);

  return (
    <section aria-label={label} className="flex flex-col gap-3" data-mobile-list>
      <div className="flex items-center gap-2">
        <label className="flex h-[46px] min-w-0 flex-1 items-center gap-2.5 rounded-j-field bg-j-field px-3.5">
          <Search aria-hidden className="h-[18px] w-[18px] shrink-0 text-j-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-j-muted" />
        </label>
        <button type="button" onClick={() => setSheet(true)} aria-label={t("sortFilter")} data-list-filter className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-j-field border border-j-line bg-j-surface text-j-ink">
          <SlidersHorizontal aria-hidden className="h-5 w-5" />
        </button>
      </div>
      <div role="tablist" aria-label={t("status")} className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none]">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={tab === x.key}
            onClick={() => setTab(x.key)}
            data-list-tab={x.key}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] ${tab === x.key ? "bg-j-ink font-bold text-white" : "border border-[#e1e6ef] bg-j-surface font-semibold text-j-ink"}`}
          >
            {x.label}
            <span className={tab === x.key ? "text-white/80" : "text-j-muted"}>{counts[x.key]}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <Card className="p-4 text-sm text-j-muted">{t("empty")}</Card>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {shown.map((i) => (
            <li key={i.id}>
              <Link href={i.href} data-list-item={i.id} className="flex flex-col gap-2 rounded-j-card border border-j-line bg-j-surface p-3.5 text-j-ink shadow-j-card">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-bold tracking-[0.2px] text-j-muted">{i.eyebrow}</span>
                  {i.status && <StatusPill tone={i.status.tone}>{i.status.label}</StatusPill>}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-base font-bold leading-snug">{i.title}</span>
                  {i.subtitle && <span className="truncate text-[0.8125rem] text-j-muted">{i.subtitle}</span>}
                </span>
                {i.facts.length > 0 && (
                  <span className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-j-muted">
                    {i.facts.map((f, n) => {
                      const Icon = f.icon ? ICONS[f.icon] : null;
                      return (
                        <span key={n} className={`flex items-center gap-1.5 ${f.tone === "danger" ? "text-[#a8261c]" : f.tone === "warn" ? "text-[#8a4b06]" : ""}`}>
                          {Icon && <Icon aria-hidden className="h-3.5 w-3.5" />}
                          {f.text}
                        </span>
                      );
                    })}
                  </span>
                )}
                {i.flag && (
                  <span className="self-start">
                    <StatusPill tone={i.flag.tone}>{i.flag.label}</StatusPill>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <BottomSheet open={sheet} onClose={() => setSheet(false)} title={t("sortFilter")}>
        <div className="flex flex-col gap-4 pb-2">
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs font-bold uppercase tracking-[0.6px] text-j-muted">{t("sort")}</legend>
            {sorts.map((s) => (
              <label key={s.key} className="flex min-h-11 items-center gap-3 text-[0.9375rem]">
                <input type="radio" name="sort" checked={sort === s.key} onChange={() => setSort(s.key)} className="h-5 w-5 accent-[#2356e8]" />
                {s.label}
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs font-bold uppercase tracking-[0.6px] text-j-muted">{t("status")}</legend>
            {tabs.map((x) => (
              <label key={x.key} className="flex min-h-11 items-center gap-3 text-[0.9375rem]">
                <input type="radio" name="tab" checked={tab === x.key} onChange={() => setTab(x.key)} className="h-5 w-5 accent-[#2356e8]" />
                <span className="flex-1">{x.label}</span>
                <span className="text-sm text-j-muted">{counts[x.key]}</span>
              </label>
            ))}
          </fieldset>
          <button type="button" onClick={() => setSheet(false)} className="flex h-[50px] items-center justify-center rounded-[14px] bg-j-accent text-[0.9375rem] font-bold text-white">
            {t("show", { count: shown.length })}
          </button>
        </div>
      </BottomSheet>
    </section>
  );
}
