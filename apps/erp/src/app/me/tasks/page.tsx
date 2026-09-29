// Task (doc 22 R5.2): the Talent's client tasks for a calendar month from ConForm (Redmine / sheet), with evidence.
// Evidence is staged, then submitted to ConForm in one step. It has no PMO approval (ConForm's existing rule).
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ConformError, type TalentTasks } from "@/lib/conform/client";
import { conformTasks, jakartaToday, nextCycle, previousCycle } from "@/lib/conform/pmo";
import { fmtDate } from "@/lib/pmo/mobile-format";
import { requireTalentActor, requireTalentSession, TalentAccessError } from "@/lib/talent/actor";
import { Card, StatusPill } from "@/components/mobile/primitives";
import { TalentFrame } from "@/components/talent/frame";
import { TaskEvidenceButton, TaskSubmitBar } from "@/components/talent/tasks";

export const dynamic = "force-dynamic";

export default async function TalentTasksPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const t = await getTranslations("talent");
  const locale = await getLocale();
  const session = await requireTalentSession();
  let actor;
  try {
    actor = await requireTalentActor();
  } catch (error) {
    if (!(error instanceof TalentAccessError)) throw error;
    return (
      <TalentFrame name={session.name} email={session.email} tab="tasks">
        <Card className="p-4 text-sm text-j-muted" data-talent-unlinked>{t("unlinked")}</Card>
      </TalentFrame>
    );
  }
  const sp = await searchParams;
  const [y, m] = jakartaToday().split("-").map(Number);
  const month = Number(sp.year) && Number(sp.month) ? { year: Number(sp.year), month: Number(sp.month) } : { year: y, month: m };
  const prev = previousCycle(month.year, month.month);
  const next = nextCycle(month.year, month.month);
  const canNext = next.year * 12 + next.month <= y * 12 + m;
  let data: TalentTasks | null = null;
  try {
    data = await conformTasks(actor.link.conform_employee_id, month.year, month.month);
  } catch (error) {
    if (!(error instanceof ConformError)) throw error;
  }

  return (
    <TalentFrame name={actor.name} email={actor.email} tab="tasks">
      <section className="flex items-center justify-between gap-2" data-tasks-period={`${month.year}-${month.month}`}>
        <Link href={`/me/tasks?year=${prev.year}&month=${prev.month}`} aria-label={t("tasks.prev")} className="flex h-11 w-11 items-center justify-center rounded-full border border-j-line bg-j-surface">
          <ChevronLeft aria-hidden className="h-5 w-5" />
        </Link>
        <h1 className="text-[19px] font-extrabold tracking-[-0.3px]">{data?.period.label ?? t("tasks.title")}</h1>
        {canNext ? (
          <Link href={`/me/tasks?year=${next.year}&month=${next.month}`} aria-label={t("tasks.next")} className="flex h-11 w-11 items-center justify-center rounded-full border border-j-line bg-j-surface">
            <ChevronRight aria-hidden className="h-5 w-5" />
          </Link>
        ) : (
          <span className="h-11 w-11" />
        )}
      </section>

      {!data ? (
        <Card className="p-4 text-sm text-j-muted" data-tasks-unavailable>{t("tasks.unavailable")}</Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" data-tasks-summary={`${data.summary.missing}/${data.summary.total}`}>
            <StatusPill tone="ok">{t("tasks.complete", { count: data.summary.complete })}</StatusPill>
            {data.summary.missing > 0 && <StatusPill tone="warn">{t("tasks.missing", { count: data.summary.missing })}</StatusPill>}
            {data.summary.staged > 0 && <StatusPill tone="accent">{t("tasks.staged", { count: data.summary.staged })}</StatusPill>}
          </div>
          {data.items.length === 0 ? (
            <Card className="p-4 text-sm text-j-muted">{t("tasks.empty")}</Card>
          ) : (
            <ul className="flex flex-col gap-2.5 pb-24">
              {data.items.map((task) => (
                <li key={task.task_key} className="flex flex-col gap-2 rounded-j-card border border-j-line bg-j-surface p-3.5 shadow-j-card" data-task={task.task_key} data-task-complete={task.complete ? "1" : "0"}>
                  <div className="flex items-start gap-3">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-bold leading-snug">{task.title}</span>
                      <span className="text-xs text-j-muted">{fmtDate(task.work_date, locale)} · {task.task_source}</span>
                    </span>
                    <StatusPill tone={task.complete ? "ok" : task.staged_count > 0 ? "accent" : "warn"}>
                      {task.complete ? t("tasks.state.complete") : task.staged_count > 0 ? t("tasks.state.staged") : t("tasks.state.missing")}
                    </StatusPill>
                  </div>
                  {!task.complete && <TaskEvidenceButton taskKey={task.task_key} title={task.title} year={month.year} month={month.month} staged={task.staged_count} />}
                </li>
              ))}
            </ul>
          )}
          {data.summary.staged > 0 && <TaskSubmitBar year={month.year} month={month.month} staged={data.summary.staged} />}
          <p className="text-xs text-j-muted">{t("tasks.note")}</p>
        </>
      )}
    </TalentFrame>
  );
}
