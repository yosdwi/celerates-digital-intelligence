// Absensi (doc 22 R4.3): the Talent's own daily attendance for a Payroll cycle, read from the client source through
// ConForm (PAMA). A day that still needs the Talent opens the existing "Lengkapi" record.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ConformError } from "@/lib/conform/client";
import { cycleLabelFor, jakartaToday, nextCycle, previousCycle } from "@/lib/conform/pmo";
import { conformSource, type AttendanceLog } from "@/lib/attendance/source";
import { fmtDate } from "@/lib/pmo/mobile-format";
import { requireTalentActor, requireTalentSession, TalentAccessError } from "@/lib/talent/actor";
import { Card, StatusPill } from "@/components/mobile/primitives";
import { TalentFrame } from "@/components/talent/frame";
import { AttendanceRow } from "@/components/talent/attendance-row";

export const dynamic = "force-dynamic";

export default async function TalentAttendancePage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const t = await getTranslations("talent");
  const locale = await getLocale();
  const session = await requireTalentSession();
  let actor;
  try {
    actor = await requireTalentActor();
  } catch (error) {
    if (!(error instanceof TalentAccessError)) throw error;
    return (
      <TalentFrame name={session.name} email={session.email} tab="attendance">
        <Card className="p-4 text-sm text-j-muted" data-talent-unlinked>{t("unlinked")}</Card>
      </TalentFrame>
    );
  }
  const sp = await searchParams;
  const current = cycleLabelFor(jakartaToday());
  const cycle = Number(sp.year) && Number(sp.month) ? { year: Number(sp.year), month: Number(sp.month) } : current;
  const prev = previousCycle(cycle.year, cycle.month);
  const next = nextCycle(cycle.year, cycle.month);
  const canNext = next.year * 12 + next.month <= current.year * 12 + current.month;
  let log: AttendanceLog | null = null;
  try {
    log = await conformSource(actor.link.conform_employee_id).log(cycle.year, cycle.month);
  } catch (error) {
    if (!(error instanceof ConformError)) throw error;
  }
  const days = log ? [...log.days].reverse() : [];
  const count = (state: string) => days.filter((d) => d.state === state).length;

  return (
    <TalentFrame name={actor.name} email={actor.email} tab="attendance">
      <section className="flex items-center justify-between gap-2" data-attendance-cycle={`${cycle.year}-${cycle.month}`}>
        <Link href={`/me/attendance?year=${prev.year}&month=${prev.month}`} aria-label={t("log.prev")} className="flex h-11 w-11 items-center justify-center rounded-full border border-j-line bg-j-surface">
          <ChevronLeft aria-hidden className="h-5 w-5" />
        </Link>
        <div className="flex min-w-0 flex-col items-center text-center">
          <h1 className="text-[19px] font-extrabold tracking-[-0.3px]">{log?.period.label ?? t("log.title")}</h1>
          {log && <p className="text-xs text-j-muted">{fmtDate(log.period.start, locale)} – {fmtDate(log.period.end, locale)}</p>}
        </div>
        {canNext ? (
          <Link href={`/me/attendance?year=${next.year}&month=${next.month}`} aria-label={t("log.next")} className="flex h-11 w-11 items-center justify-center rounded-full border border-j-line bg-j-surface">
            <ChevronRight aria-hidden className="h-5 w-5" />
          </Link>
        ) : (
          <span className="h-11 w-11" />
        )}
      </section>

      {!log ? (
        <Card className="p-4 text-sm text-j-muted" data-attendance-unavailable>{t("log.unavailable")}</Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" data-attendance-summary>
            <StatusPill tone="ok">{t("log.summary.complete", { count: count("complete") + count("excused") })}</StatusPill>
            {count("needs_action") > 0 && <StatusPill tone="warn">{t("log.summary.needs", { count: count("needs_action") })}</StatusPill>}
            {count("waiting_review") > 0 && <StatusPill tone="accent">{t("log.summary.waiting", { count: count("waiting_review") })}</StatusPill>}
          </div>
          {days.length === 0 ? (
            <Card className="p-4 text-sm text-j-muted">{t("log.empty")}</Card>
          ) : (
            <Card className="px-3.5 py-1">
              <ul className="divide-y divide-j-line-soft">
                {days.map((day) => (
                  <li key={day.workDate}>
                    <AttendanceRow day={day} locale={locale} href={["needs_action", "waiting_review"].includes(day.state) ? `/me/attendance/${day.workDate}?year=${cycle.year}&month=${cycle.month}` : null} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <p className="text-xs text-j-muted">{t("log.sourceNote", { through: log.period.evaluatedThrough ? fmtDate(log.period.evaluatedThrough, locale) : "—" })}</p>
        </>
      )}
    </TalentFrame>
  );
}
