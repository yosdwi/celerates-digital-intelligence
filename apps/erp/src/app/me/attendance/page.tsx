import { getLocale, getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";
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
  const shortDate = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const totalDays = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(period.year, period.month - 1, 1)).getUTCDay();
  const mondayOffset = (firstWeekday + 6) % 7;
  const cellCount = Math.ceil((mondayOffset + totalDays) / 7) * 7;
  const daysByDate = new Map((log?.days ?? []).map((day) => [day.workDate, day]));
  const requirementsByDate = new Map(requirements.map((requirement) => [requirement.work_date, requirement]));
  const actionableRequirements = requirements.filter((requirement) => requirement.state === "needs_action");
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

  const calendar = log ? (
    <section className="rounded-[18px] border border-j-line bg-j-surface p-3.5 shadow-j-card md:p-5" data-attendance-month={`${period.year}-${pad2(period.month)}`}>
      <div className="mb-2 grid grid-cols-7 gap-1 md:mb-3 md:gap-2">
        {weekdays.map((weekday) => (
          <div key={weekday} className="py-1 text-center text-[11px] font-bold text-j-faint md:text-xs">{weekday}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 md:gap-2">
        {Array.from({ length: cellCount }, (_, index) => {
          const dayNumber = index - mondayOffset + 1;
          if (dayNumber < 1 || dayNumber > totalDays) return <span key={`blank-${index}`} className="aspect-square" aria-hidden />;
          const iso = `${period.year}-${pad2(period.month)}-${pad2(dayNumber)}`;
          const day = daysByDate.get(iso);
          const requirement = requirementsByDate.get(iso);
          const actionable = day?.state === "needs_action" && requirement?.state === "needs_action";
          const cellClass = `relative flex aspect-square min-h-10 items-center justify-center rounded-xl text-[14px] transition md:min-h-[72px] md:rounded-[14px] md:text-[15px] ${tone(day)}`;
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

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-j-line-soft pt-3 text-[11px] text-j-muted md:mt-5 md:text-xs">
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#d92d20]" />Perlu dilengkapi</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#12a27a]" />Lengkap</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#2f5bea]" />Sudah dikirim</span>
      </div>
    </section>
  ) : (
    <Card className="p-4 text-sm text-j-muted" data-attendance-unavailable>{t("log.unavailable")}</Card>
  );

  return (
    <TalentFrame name={actor.name} email={actor.email} tab="attendance" period={period}>
      <TalentMonthPicker year={period.year} month={period.month} label={monthLabel} basePath="/me/attendance" maxYear={todayYear} maxMonth={todayMonth} />

      <div className="md:grid md:grid-cols-[minmax(0,1fr)_310px] md:items-start md:gap-5">
        {calendar}

        {log && (
          <aside className="mt-4 hidden rounded-[18px] border border-j-line bg-j-surface p-4 shadow-j-card md:mt-0 md:block" aria-label="Attendance yang perlu dilengkapi">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold">Perlu dilengkapi</p>
                <p className="mt-0.5 text-xs text-j-muted">Tanggal yang masih butuh tindakan.</p>
              </div>
              <span className="rounded-full bg-[#fff0ed] px-2.5 py-1 text-xs font-extrabold text-[#b42318]">{actionableRequirements.length}</span>
            </div>

            {actionableRequirements.length === 0 ? (
              <div className="rounded-[14px] bg-[#f4fbf8] px-3.5 py-4 text-sm font-semibold text-j-ok">Semua attendance bulan ini sudah lengkap.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {actionableRequirements.map((requirement) => (
                  <CorrectionSheet
                    key={`aside-${requirement.work_date}`}
                    requirement={requirement}
                    trigger={
                      <>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block text-sm font-bold capitalize">{shortDate.format(new Date(`${requirement.work_date}T00:00:00Z`))}</span>
                          <span className="mt-0.5 block truncate text-xs font-normal text-j-muted">{t(`gap.${requirement.gap}`)}</span>
                        </span>
                        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-j-faint" />
                      </>
                    }
                    triggerClassName="flex min-h-14 w-full items-center gap-2 rounded-[12px] border border-j-line-soft px-3 py-2.5 hover:border-[#efb5ae] hover:bg-[#fff8f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-j-accent"
                    triggerAriaLabel={`${requirement.work_date}. Lengkapi attendance`}
                  />
                ))}
              </div>
            )}
          </aside>
        )}
      </div>
    </TalentFrame>
  );
}
