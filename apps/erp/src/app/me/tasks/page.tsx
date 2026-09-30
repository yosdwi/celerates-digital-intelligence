import { getLocale, getTranslations } from "next-intl/server";
import { CheckCircle2, ImageIcon } from "lucide-react";
import { ConformError, type TalentTasks } from "@/lib/conform/client";
import { conformTasks, jakartaToday } from "@/lib/conform/pmo";
import { fmtDate } from "@/lib/pmo/mobile-format";
import { requireTalentActor, requireTalentSession, TalentAccessError } from "@/lib/talent/actor";
import { Card, StatusPill } from "@/components/mobile/primitives";
import { TalentFrame } from "@/components/talent/frame";
import { TalentMonthPicker } from "@/components/talent/month-picker";
import { TaskEvidenceButton } from "@/components/talent/tasks";

export const dynamic = "force-dynamic";

function validMonth(year: number, month: number) {
  return Number.isInteger(year) && year >= 2000 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12;
}

const isClosed = (status: string) => status.trim().toLowerCase() === "closed";

export default async function TalentTasksPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const t = await getTranslations("talent");
  const locale = await getLocale();
  const session = await requireTalentSession();
  const sp = await searchParams;
  const [todayYear, todayMonth] = jakartaToday().split("-").map(Number);
  const requestedYear = Number(sp.year);
  const requestedMonth = Number(sp.month);
  const period = validMonth(requestedYear, requestedMonth) ? { year: requestedYear, month: requestedMonth } : { year: todayYear, month: todayMonth };

  let actor;
  try {
    actor = await requireTalentActor();
  } catch (error) {
    if (!(error instanceof TalentAccessError)) throw error;
    return (
      <TalentFrame name={session.name} email={session.email} tab="tasks" period={period}>
        <Card className="p-4 text-sm text-j-muted" data-talent-unlinked>{t("unlinked")}</Card>
      </TalentFrame>
    );
  }

  let data: TalentTasks | null = null;
  try {
    data = await conformTasks(actor.link.conform_employee_id, period.year, period.month);
  } catch (error) {
    if (!(error instanceof ConformError)) throw error;
  }

  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(period.year, period.month - 1, 1)));
  const items = data ? [...data.items].sort((a, b) => Number(isClosed(a.status)) - Number(isClosed(b.status))) : [];

  return (
    <TalentFrame name={actor.name} email={actor.email} tab="tasks" period={period}>
      <TalentMonthPicker year={period.year} month={period.month} label={monthLabel} basePath="/me/tasks" maxYear={todayYear} maxMonth={todayMonth} />

      {!data ? (
        <Card className="p-4 text-sm text-j-muted" data-tasks-unavailable>{t("tasks.unavailable")}</Card>
      ) : items.length === 0 ? (
        <Card className="p-4 text-sm text-j-muted">Tidak ada task pada bulan ini.</Card>
      ) : (
        <ul className="flex flex-col gap-2.5" data-tasks-period={`${period.year}-${period.month}`}>
          {items.map((task) => {
            const closed = isClosed(task.status);
            const hasEvidence = task.evidence_count > 0 || task.staged_count > 0;
            return (
              <li
                key={task.task_key}
                className="overflow-hidden rounded-[16px] border border-j-line bg-j-surface shadow-j-card"
                data-task={task.task_key}
                data-task-status={task.status}
                data-task-evidence={hasEvidence ? "1" : "0"}
              >
                <div className="flex items-start gap-3 p-3.5">
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[15px] font-bold leading-snug">{task.title}</span>
                    <span className="text-xs text-j-muted">{fmtDate(task.work_date, locale)} · {task.task_source}</span>
                  </span>
                  <StatusPill tone={closed ? "ok" : "accent"}>{task.status || "—"}</StatusPill>
                </div>

                {closed && (
                  <div className="flex items-center justify-between gap-3 border-t border-j-line-soft px-3.5 py-3">
                    {hasEvidence ? (
                      <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-j-ok">
                        <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" /> Evidence tersedia
                      </span>
                    ) : (
                      <span className="flex min-w-0 items-center gap-2 text-[13px] text-j-muted">
                        <ImageIcon aria-hidden className="h-4 w-4 shrink-0" /> Evidence belum ada
                      </span>
                    )}
                    {!hasEvidence && <TaskEvidenceButton taskKey={task.task_key} title={task.title} year={period.year} month={period.month} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </TalentFrame>
  );
}
