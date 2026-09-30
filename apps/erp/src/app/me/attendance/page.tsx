import { getLocale, getTranslations } from "next-intl/server";
import { ConformError, type Requirement } from "@/lib/conform/client";
import { jakartaToday } from "@/lib/conform/pmo";
import { conformMonthRequirements, conformSource, type AttendanceDay, type AttendanceLog } from "@/lib/attendance/source";
import { requireTalentActor, requireTalentSession, TalentAccessError } from "@/lib/talent/actor";
import { Card } from "@/components/mobile/primitives";
import { TalentFrame } from "@/components/talent/frame";
import { TalentMonthPicker } from "@/components/talent/month-picker";
import { CorrectionSheet } from "@/components/talent/talent";

export const dynamic = "force-dynamic";

const pad2 = (value: number) => String(value).padStart(2, "0");
const stateLabel: Record<AttendanceDay["state"], string> = {
  complete: "Lengkap",
  needs_action: "Perlu dilengkapi",
  waiting_review: "Sudah dikirim",
  excused: "Izin",
  unverified: "Belum terverifikasi",
  not_required: "Libur",
};

function validMonth(year: number, month: number) {
  return Number.isInteger(year) && year >= 2000 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12;
}

export default async function TalentAttendancePage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
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
      <TalentFrame name={session.name} email={session.email} tab="attendance" period={period}>
        <Card className="p-4 text-sm text-j-muted" data-talent-unlinked>{t("unlinked")}</Card>
      </TalentFrame>
    );
  }

  let log: AttendanceLog | null = null;
  let requirements: Requirement[] = [];
  try {
    [log, requirements] = await Promise.all([
      conformSource(actor.link.conform_employee_id).log(period.year, period.month),
      conformMonthRequirements(actor.link.conform_employee_id, period.year, period.month),
    ]);
  } catch (error) {
    if (!(error instanceof ConformError)) throw error;
  }

  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(period.year, period.month - 1, 1)));
  const totalDays = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(period.year, period.month - 1, 1)).getUTCDay();
  const mondayOffset = (firstWeekday + 6) % 7;
  const cellCount = Math.ceil((mondayOffset + totalDays) / 7) * 7;
  const daysByDate = new Map((log?.days ?? []).map((day) => [day.workDate, day]));
  const requirementsByDate = new Map(requirements.map((requirement) => [requirement.work_date, requirement]));
  const weekdays = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

  const tone = (day?: AttendanceDay) => {
    if (!day) return "text-[#b2b8c2]";
    if (day.state === "needs_action") return "bg-[#fff0ed] text-[#b42318] ring-1 ring-inset ring-[#f5c2bc] font-extrabold";
    if (day.state === "waiting_review") return "bg-[#eef4ff] text-[#2454d6] ring-1 ring-inset ring-[#d7e2ff] font-bold";
    if (day.state === "not_required" || day.state === "excused") return "text-[#a0a7b4]";
    return "text-j-ink";
  };

  const marker = (day?: AttendanceDay) => {
    if (!day) return null;
    if (day.state === "needs_action") return <span className="absolute bottom-1.5 h-1.5 w-1.5 rounded-full bg-[#d92d20]" />;
    if (day.state === "waiting_review") return <span className="absolute bottom-1.5 h-1.5 w-1.5 rounded-full bg-[#2f5bea]" />;
    if (day.state === "complete") return <span className="absolute bottom-1.5 h-1.5 w-1.5 rounded-full bg-[#12a27a]" />;
    return null;
  };

  return (
    <TalentFrame name={actor.name} email={actor.email} tab="attendance" period={period}>
      <TalentMonthPicker year={period.year} month={period.month} label={monthLabel} basePath="/me/attendance" maxYear={todayYear} maxMonth={todayMonth} />

      {!log ? (
        <Card className="p-4 text-sm text-j-muted" data-attendance-unavailable>{t("log.unavailable")}</Card>
      ) : (
        <section className="rounded-[18px] border border-j-line bg-j-surface p-3.5 shadow-j-card" data-attendance-month={`${period.year}-${pad2(period.month)}`}>
          <div className="mb-2 grid grid-cols-7 gap-1">
            {weekdays.map((weekday) => (
              <div key={weekday} className="py-1 text-center text-[11px] font-bold text-j-faint">{weekday}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: cellCount }, (_, index) => {
              const dayNumber = index - mondayOffset + 1;
              if (dayNumber < 1 || dayNumber > totalDays) return <span key={`blank-${index}`} className="aspect-square" aria-hidden />;
              const iso = `${period.year}-${pad2(period.month)}-${pad2(dayNumber)}`;
              const day = daysByDate.get(iso);
              const requirement = requirementsByDate.get(iso);
              const actionable = day?.state === "needs_action" && requirement?.state === "needs_action";
              const cellClass = `relative flex aspect-square min-h-10 items-center justify-center rounded-xl text-[14px] transition ${tone(day)}`;
              const aria = `${dayNumber} ${monthLabel}: ${day ? stateLabel[day.state] : "Belum ada data"}${day?.reason ? `, ${day.reason}` : ""}`;

              if (actionable && requirement) {
                return (
                  <CorrectionSheet
                    key={iso}
                    requirement={requirement}
                    trigger={<><span>{dayNumber}</span>{marker(day)}</>}
                    triggerClassName={`${cellClass} cursor-pointer hover:ring-2 hover:ring-[#e98a80] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-j-accent`}
                    triggerAriaLabel={`${aria}. Lengkapi attendance`}
                  />
                );
              }

              return (
                <div key={iso} className={cellClass} aria-label={aria} title={day?.reason || stateLabel[day?.state ?? "unverified"]} data-attendance-day={iso} data-attendance-state={day?.state ?? "empty"}>
                  <span>{dayNumber}</span>
                  {marker(day)}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-j-line-soft pt-3 text-[11px] text-j-muted">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#d92d20]" />Perlu dilengkapi</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#12a27a]" />Lengkap</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#2f5bea]" />Sudah dikirim</span>
          </div>
        </section>
      )}
    </TalentFrame>
  );
}
