// Kelengkapan Saya (doc 21 §6): the Talent's own open operational requirements, from ConForm's live projection.
// Action-first, not a reduced backoffice menu. Only the linked ConForm employee is ever queried.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, Hourglass } from "lucide-react";
import { ConformError, type TalentRequirements, type TalentTasks } from "@/lib/conform/client";
import { conformRequirements, conformTasks, cycleLabelFor, jakartaToday, previousCycle } from "@/lib/conform/pmo";
import { fmtDate } from "@/lib/pmo/mobile-format";
import { requireTalentActor, requireTalentSession, TalentAccessError } from "@/lib/talent/actor";
import { Card, StatusPill } from "@/components/mobile/primitives";
import { TalentFrame } from "@/components/talent/frame";

export const dynamic = "force-dynamic";

export default async function TalentHome({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const t = await getTranslations("talent");
  const locale = await getLocale();
  const session = await requireTalentSession();
  let actor;
  try {
    actor = await requireTalentActor();
  } catch (error) {
    if (!(error instanceof TalentAccessError)) throw error;
    return (
      <TalentFrame name={session.name} email={session.email}>
        <Card className="p-4 text-sm text-j-muted" data-talent-unlinked>{t("unlinked")}</Card>
      </TalentFrame>
    );
  }
  const sp = await searchParams;
  const current = cycleLabelFor(jakartaToday());
  const asked = Number(sp.year) && Number(sp.month) ? { year: Number(sp.year), month: Number(sp.month) } : null;
  const cycles = asked ? [asked] : [current, previousCycle(current.year, current.month)];
  let results: TalentRequirements[] = [];
  let tasks: TalentTasks | null = null;
  let unavailable = false;
  try {
    [results, tasks] = await Promise.all([
      Promise.all(cycles.map((c) => conformRequirements(actor.link.conform_employee_id, c.year, c.month))),
      conformTasks(actor.link.conform_employee_id, asked?.year, asked?.month).catch((error: unknown) => {
        if (error instanceof ConformError) return null;
        throw error;
      }),
    ]);
  } catch (error) {
    if (!(error instanceof ConformError)) throw error;
    unavailable = true;
  }
  const missingTasks = tasks?.summary.missing ?? 0;
  const open = results.flatMap((r) => r.requirements.map((req) => ({ ...req, cycle: r.cycle })));
  const needs = open.filter((r) => r.state === "needs_action");
  const waiting = open.filter((r) => r.state === "waiting_review");
  const first = actor.name.split(" ")[0] || actor.link.display_name.split(" ")[0];

  return (
    <TalentFrame name={actor.name} email={actor.email} tab="home">
      <section className="flex flex-col gap-1">
        <h1 className="text-[27px] font-extrabold leading-[1.15] tracking-[-0.6px]">{t("hello", { name: first })}</h1>
        <p className="text-sm text-j-muted">{t("subtitle")}</p>
      </section>

      {unavailable ? (
        <Card className="p-4 text-sm text-j-muted">{t("unavailable")}</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5" data-talent-summary>
            <Card className="flex flex-col gap-1 p-3.5">
              <span className="flex items-center gap-1.5 text-xs font-bold text-[#8a4b06]"><CalendarClock aria-hidden className="h-4 w-4" />{t("needsTitle")}</span>
              <span className="text-[26px] font-extrabold" data-needs-count>{needs.length}</span>
            </Card>
            <Card className="flex flex-col gap-1 p-3.5">
              <span className="flex items-center gap-1.5 text-xs font-bold text-j-accent-strong"><Hourglass aria-hidden className="h-4 w-4" />{t("waitingTitle")}</span>
              <span className="text-[26px] font-extrabold" data-waiting-count>{waiting.length}</span>
            </Card>
          </div>

          {tasks && (
            <Link href="/me/tasks" className="flex items-center gap-3 rounded-j-card border border-j-line bg-j-surface p-3.5 shadow-j-card" data-talent-task-summary={missingTasks}>
              <ClipboardCheck aria-hidden className={`h-5 w-5 shrink-0 ${missingTasks ? "text-[#8a4b06]" : "text-j-ok"}`} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-bold">{t("tasks.summaryTitle", { period: tasks.period.label })}</span>
                <span className="text-[13px] text-j-muted">
                  {missingTasks ? t("tasks.summaryMissing", { missing: missingTasks, total: tasks.summary.total }) : t("tasks.summaryDone", { total: tasks.summary.total })}
                </span>
              </span>
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-j-faint" />
            </Link>
          )}

          {open.length === 0 && missingTasks === 0 ? (
            <Card className="flex flex-col items-center gap-2 px-4 py-8 text-center" data-talent-clear>
              <CheckCircle2 aria-hidden className="h-9 w-9 text-j-ok" />
              <p className="text-[15px] font-bold">{t("clearTitle")}</p>
              <p className="text-sm text-j-muted">{t("clearBody")}</p>
            </Card>
          ) : (
            results
              .filter((r) => r.requirements.length > 0)
              .map((r) => (
                <section key={r.cycle.id} className="flex flex-col gap-2" data-talent-cycle={r.cycle.id}>
                  <h2 className="text-base font-bold">{r.cycle.label}</h2>
                  <ul className="flex flex-col gap-2.5">
                    {r.requirements.map((req) => (
                      <li key={req.requirement_id} data-requirement={req.work_date} data-requirement-state={req.state}>
                        <Link
                          href={`/me/attendance/${req.work_date}?year=${r.cycle.year}&month=${r.cycle.month}`}
                          className="flex items-center gap-3 rounded-j-card border border-j-line bg-j-surface p-3.5 shadow-j-card"
                        >
                          <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="text-xs font-bold text-j-muted">{t("attendance")}</span>
                            <span className="text-[15px] font-bold">{fmtDate(req.work_date, locale)}</span>
                            <span className="text-[13px] text-j-muted">{t(`gap.${req.gap}`)}</span>
                          </span>
                          <StatusPill tone={req.state === "needs_action" ? (req.correction?.status === "rejected" ? "danger" : "warn") : "accent"}>
                            {req.state === "needs_action" ? (req.correction?.status === "rejected" ? t("rejected") : t("needs")) : t("waiting")}
                          </StatusPill>
                          <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-j-faint" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
          )}
          <p className="text-xs text-j-muted">{t("scope")}</p>
        </>
      )}
    </TalentFrame>
  );
}
