// PMO › Operational Readiness (doc 21 §7). ConForm's live closing projection for a Payroll cycle, the BAST gate per
// team, source freshness and the actions PMO takes here: BAST, canonical CSV, reminder campaign, group summary.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { canWrite, requireDivisionRead } from "@/lib/module-guard";
import { ConformError, conformConfigured, type Readiness } from "@/lib/conform/client";
import { conformCampaigns, conformControl, conformReadiness, cycleLabelFor, jakartaToday, previousCycle } from "@/lib/conform/pmo";
import { fmtDate, fmtStamp } from "@/lib/pmo/mobile-format";
import { FilterableList, type ListItem, type Tone } from "@/components/mobile/filterable-list";
import { Card, MobileScreen, StatusPill } from "@/components/mobile/primitives";
import { ModuleHeader } from "@/components/mobile/record";
import { ReadinessActions } from "@/components/conform/readiness-actions";

export const dynamic = "force-dynamic";
const STATUS_TONE: Record<string, Tone> = { NEEDS_TALENT_ACTION: "warn", WAITING_SUBMITTED: "accent", COMPLETE: "ok" };

export default async function OperationalReadinessPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const { claims, levels } = await requireDivisionRead("pmo");
  const t = await getTranslations("conform");
  const locale = await getLocale();
  const sp = await searchParams;
  const current = cycleLabelFor(jakartaToday());
  const cycle = Number(sp.year) && Number(sp.month) ? { year: Number(sp.year), month: Number(sp.month) } : current;
  const prev = previousCycle(cycle.year, cycle.month);
  const next = cycle.month === 12 ? { year: cycle.year + 1, month: 1 } : { year: cycle.year, month: cycle.month + 1 };
  const siblings = [
    { href: "/pmo/contracts", label: "A.Contract" },
    { href: "/pmo/invoices", label: "TM Invoice" },
    { href: "/pmo/readiness", label: t("title"), active: true },
  ];

  let data: Readiness | null = null;
  let error: string | null = null;
  let campaigns: Awaited<ReturnType<typeof conformCampaigns>>["items"] = [];
  let killSwitch = false;
  if (!conformConfigured()) error = t("unconfigured");
  else {
    try {
      [data, { items: campaigns }, { kill_switch: killSwitch }] = await Promise.all([conformReadiness(cycle.year, cycle.month), conformCampaigns(10), conformControl()]);
    } catch (e) {
      error = e instanceof ConformError ? e.message : t("unavailable");
    }
  }

  const items: ListItem[] = (data?.talents ?? []).map((talent) => ({
    id: talent.employee_id,
    href: `/pmo/readiness/talent/${encodeURIComponent(talent.employee_id)}?year=${cycle.year}&month=${cycle.month}`,
    eyebrow: talent.nrp,
    title: talent.name,
    subtitle: talent.role,
    facts: [
      ...(talent.actionable_days ? [{ icon: "alert" as const, text: t("daysNeed", { count: talent.actionable_days }), tone: "warn" as const }] : []),
      ...(talent.waiting_days ? [{ icon: "clock" as const, text: t("daysWaiting", { count: talent.waiting_days }) }] : []),
      ...(!talent.whatsapp_bound ? [{ icon: "alert" as const, text: t("waNotBound") }] : []),
    ],
    status: { label: t(`status.${talent.status}`), tone: STATUS_TONE[talent.status] ?? "muted" },
    flag: null,
    search: `${talent.name} ${talent.nrp} ${talent.role}`.toLowerCase(),
    tabs: [talent.status],
    sort: { name: talent.name.toLowerCase(), need: -talent.actionable_days },
  }));
  const running = campaigns.filter((c) => ["draft", "running", "paused"].includes(c.state));

  return (
    <MobileScreen label={t("title")}>
      <ModuleHeader moduleKey="pmo" title={t("title")} siblings={siblings} />
      <nav className="flex items-center justify-between rounded-j-card border border-j-line bg-j-surface px-2 py-1.5 shadow-j-card" aria-label={t("cycle")} data-readiness-cycle>
        <Link href={`/pmo/readiness?year=${prev.year}&month=${prev.month}`} aria-label={t("prevCycle")} className="flex h-10 w-10 items-center justify-center rounded-xl text-j-accent"><ChevronLeft aria-hidden className="h-5 w-5" /></Link>
        <span className="flex flex-col items-center">
          <span className="text-[15px] font-bold">{data?.cycle.label ?? `${cycle.year}-${String(cycle.month).padStart(2, "0")}`}</span>
          {data && <span className="text-xs text-j-muted">{fmtDate(data.cycle.start, locale)} – {fmtDate(data.cycle.end, locale)}</span>}
        </span>
        <Link href={`/pmo/readiness?year=${next.year}&month=${next.month}`} aria-label={t("nextCycle")} className="flex h-10 w-10 items-center justify-center rounded-xl text-j-accent"><ChevronRight aria-hidden className="h-5 w-5" /></Link>
      </nav>

      {error || !data ? (
        <Card className="p-4 text-sm text-j-muted" data-readiness-error>{error ?? t("unavailable")}</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5" data-readiness-summary>
            {([
              ["complete", data.summary.complete, "ok"],
              ["needs_talent_action", data.summary.needs_talent_action, "warn"],
              ["waiting_submitted", data.summary.waiting_submitted, "accent"],
              ["unverified", data.summary.unverified, "muted"],
            ] as const).map(([key, value, tone]) => (
              <Card key={key} className="flex flex-col gap-1 p-3.5" data-summary={key}>
                <span className="text-xs font-bold text-j-muted">{t(`summary.${key}`)}</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="text-[24px] font-extrabold">{value}</span>
                  <span className="text-xs text-j-muted">/ {data.summary.total_talents}</span>
                </span>
                <span className={`h-1 rounded-full ${tone === "ok" ? "bg-j-ok" : tone === "warn" ? "bg-j-warn-dot" : tone === "accent" ? "bg-j-accent" : "bg-j-line"}`} aria-hidden />
              </Card>
            ))}
          </div>

          {data.pending_corrections > 0 && (
            <Link href="/review" className="flex items-center gap-3 rounded-j-card border border-[#c9d4f2] bg-[#f7f9ff] px-3.5 py-3" data-readiness-review>
              <Inbox aria-hidden className="h-5 w-5 text-j-accent" />
              <span className="flex-1 text-sm font-bold">{t("pendingCorrections", { count: data.pending_corrections })}</span>
              <ChevronRight aria-hidden className="h-[18px] w-[18px] text-j-accent" />
            </Link>
          )}

          <section className="flex flex-col gap-2" data-record-section="bast">
            <h2 className="text-[15px] font-bold">{t("bastGate")}</h2>
            <Card className="px-3.5 py-1">
              <ul className="divide-y divide-j-line-soft">
                {data.bast.map((gate) => (
                  <li key={gate.report_type} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-semibold">{t(`team.${gate.report_type}`)}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-j-muted">{gate.ready_talents}/{gate.total_talents}</span>
                      <StatusPill tone={gate.ready ? "ok" : "warn"}>{gate.ready ? t("ready") : t("notReady")}</StatusPill>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <ReadinessActions
            year={cycle.year}
            month={cycle.month}
            cycleLabel={data.cycle.label}
            needs={data.summary.needs_talent_action}
            canEdit={canWrite(levels.pmo)}
            canFull={levels.pmo === "full"}
            isOwner={claims.isOwner === true}
            killSwitch={killSwitch}
            campaigns={running.map((c) => ({ id: c.id, state: c.state, label: c.cycle.label, counts: c.counts }))}
          />

          <section className="flex flex-col gap-2" data-record-section="talents">
            <h2 className="text-[15px] font-bold">{t("talents")}</h2>
            <FilterableList
              label={t("talents")}
              items={items}
              tabs={[
                { key: "all", label: t("tabs.all") },
                { key: "NEEDS_TALENT_ACTION", label: t("status.NEEDS_TALENT_ACTION") },
                { key: "WAITING_SUBMITTED", label: t("status.WAITING_SUBMITTED") },
                { key: "COMPLETE", label: t("status.COMPLETE") },
              ]}
              sorts={[
                { key: "need", label: t("sort.need"), dir: "asc" },
                { key: "name", label: t("sort.name"), dir: "asc" },
              ]}
            />
          </section>

          <section className="flex flex-col gap-1 text-xs text-j-muted" data-record-section="sources">
            <span className="font-bold">{t("sources")}</span>
            {data.sources.map((s) => (
              <span key={s.source_key}>
                {s.label}: {s.last_success_at ? fmtStamp(s.last_success_at, locale) : t("never")}
              </span>
            ))}
            <span>{t("evaluatedThrough", { date: data.evaluated_through ? fmtDate(data.evaluated_through, locale) : "—" })}</span>
          </section>
        </>
      )}
    </MobileScreen>
  );
}
