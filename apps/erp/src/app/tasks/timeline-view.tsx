"use client";
import { useLocale, useTranslations } from "next-intl";
import type { Task } from "./task-card";

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog", todo: "To Do", in_progress: "In Progress", in_review: "In Review", done: "Done",
};
const STATUS_BAR_COLORS: Record<string, string> = {
  backlog: "bg-slate-300", todo: "bg-slate-400", in_progress: "bg-blue-500", in_review: "bg-amber-500", done: "bg-green-500",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_NAMES_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTH_NAMES_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function rangeOf(task: Task, children: Task[]): { start: Date; end: Date } | null {
  const dates: Date[] = [];
  const own = [toDate(task.start_date), toDate(task.due_date)].filter((d): d is Date => d !== null);
  dates.push(...own);
  for (const c of children) {
    const cd = [toDate(c.start_date), toDate(c.due_date)].filter((d): d is Date => d !== null);
    dates.push(...cd);
  }
  if (dates.length === 0) return null;
  const start = new Date(Math.min(...dates.map((d) => d.getTime())));
  const end = new Date(Math.max(...dates.map((d) => d.getTime())));
  return { start, end: end < start ? start : end };
}

export function TimelineView({ tasks }: { tasks: Task[] }) {
  const locale = useLocale();
  const tt = useTranslations("tasks");
  const MONTH_NAMES = locale === "en" ? MONTH_NAMES_EN : MONTH_NAMES_ID;
  const groups = tasks.filter((t) => !t.parent_id);
  const rows = groups.map((g) => ({
    group: g,
    children: tasks.filter((t) => t.parent_id === g.id),
  }));

  const rangedRows = rows.map((r) => ({ ...r, range: rangeOf(r.group, r.children) }));
  const validRanges = rangedRows.map((r) => r.range).filter((r): r is { start: Date; end: Date } => r !== null);

  const today = new Date(new Date().toDateString());
  let rangeStart = validRanges.length ? new Date(Math.min(...validRanges.map((r) => r.start.getTime()))) : today;
  let rangeEnd = validRanges.length ? new Date(Math.max(...validRanges.map((r) => r.end.getTime()))) : new Date(today.getTime() + 60 * DAY_MS);

  rangeStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  rangeEnd = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() + 1, 0);
  if (rangeEnd.getTime() - rangeStart.getTime() < 30 * DAY_MS) {
    rangeEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 2, 0);
  }

  const totalDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / DAY_MS) + 1;
  const DAY_PX = 6;
  const totalWidth = totalDays * DAY_PX;

  const months: { label: string; days: number }[] = [];
  let cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const segmentEnd = monthEnd < rangeEnd ? monthEnd : rangeEnd;
    const days = Math.round((segmentEnd.getTime() - cursor.getTime()) / DAY_MS) + 1;
    months.push({ label: `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`, days });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  function offsetPx(d: Date): number {
    return Math.round((d.getTime() - rangeStart.getTime()) / DAY_MS) * DAY_PX;
  }
  const todayOffset = offsetPx(today);

  if (groups.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-16">{tt("noTasksTimeline")}</p>;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex">
        <div className="w-64 shrink-0 border-r border-slate-200">
          <div className="h-10 border-b border-slate-200 bg-slate-50" />
          {rangedRows.map(({ group, children }) => (
            <div key={group.id} className="h-12 flex items-center gap-2 px-3 border-b border-slate-100 last:border-0">
              <span className="text-[10px] font-mono text-slate-400 shrink-0">{group.task_no}</span>
              <span className="text-sm font-medium text-slate-800 truncate" title={group.title}>{group.title}</span>
              {children.length > 0 && <span className="text-[10px] text-slate-400 shrink-0">({children.length})</span>}
            </div>
          ))}
        </div>

        <div className="overflow-x-auto flex-1">
          <div style={{ width: totalWidth, minWidth: "100%" }} className="relative">
            <div className="flex h-10 border-b border-slate-200 bg-slate-50">
              {months.map((m, i) => (
                <div
                  key={i}
                  style={{ width: m.days * DAY_PX }}
                  className="shrink-0 flex items-center justify-center text-xs font-medium text-slate-500 border-r border-slate-200 last:border-0"
                >
                  {m.label}
                </div>
              ))}
            </div>

            {todayOffset >= 0 && todayOffset <= totalWidth && (
              <div className="absolute top-10 bottom-0 w-px bg-brand-500 z-10" style={{ left: todayOffset }} />
            )}

            {rangedRows.map(({ group, range }) => (
              <div key={group.id} className="h-12 relative border-b border-slate-100 last:border-0">
                {range && (
                  <div
                    className={`absolute top-3 h-6 rounded-md ${STATUS_BAR_COLORS[group.status_code] ?? "bg-slate-400"} flex items-center px-2 min-w-[8px]`}
                    style={{ left: offsetPx(range.start), width: Math.max(offsetPx(range.end) - offsetPx(range.start) + DAY_PX, 8) }}
                    title={`${STATUS_LABELS[group.status_code] ?? group.status_code} · ${range.start.toISOString().slice(0, 10)} - ${range.end.toISOString().slice(0, 10)}`}
                  >
                    <span className="text-[10px] font-medium text-white truncate">{group.title}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
