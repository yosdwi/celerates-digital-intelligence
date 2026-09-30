// Attendance sources (doc 22 R4.1). The ERP shows attendance from more than one system of record behind one shape:
// "native" is the ERP's own clock-in/out (attendance_logs); "conform" reads a linked Talent's client attendance
// (PAMA) from ConForm on demand. Nothing is copied: ConForm stays the record for client attendance.
import type { Sql } from "postgres";
import type { AttendanceDayState, Requirement } from "@/lib/conform/client";
import { conformAttendance, conformRequirements, cycleLabelFor } from "@/lib/conform/pmo";

export type AttendanceDay = {
  workDate: string;
  checkIn: string | null;
  checkOut: string | null;
  source: "native" | "conform:pama";
  state: AttendanceDayState;
  gap: Requirement["gap"] | null;
  reason: string;
  evidenceCount: number;
  correction: Requirement["correction"];
};
export type AttendancePeriod = { label: string; year: number; month: number; start: string; end: string; evaluatedThrough: string | null };
export type AttendanceLog = { source: AttendanceDay["source"]; period: AttendancePeriod; days: AttendanceDay[] };

export interface AttendanceSource {
  readonly key: AttendanceDay["source"];
  log(year: number, month: number): Promise<AttendanceLog>;
}

const pad2 = (value: number) => String(value).padStart(2, "0");

function calendarMonth(year: number, month: number) {
  const prefix = `${year}-${pad2(month)}`;
  const start = `${prefix}-01`;
  const end = `${prefix}-${pad2(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
  const sourcePeriods = [cycleLabelFor(start), cycleLabelFor(end)].filter(
    (item, index, all) => all.findIndex((other) => other.year === item.year && other.month === item.month) === index,
  );
  return { prefix, start, end, sourcePeriods };
}

/**
 * ConForm's current transport can split one calendar month across two internal operational periods.
 * Talent never needs that distinction: this adapter composes those reads into one calendar-month Timesheet view.
 */
export function conformSource(employeeId: string): AttendanceSource {
  return {
    key: "conform:pama",
    async log(year, month) {
      const calendar = calendarMonth(year, month);
      const sourceLogs = await Promise.all(calendar.sourcePeriods.map((period) => conformAttendance(employeeId, period.year, period.month)));
      const byDate = new Map<string, AttendanceDay>();
      for (const data of sourceLogs) {
        for (const day of data.days) {
          if (!day.work_date.startsWith(`${calendar.prefix}-`)) continue;
          byDate.set(day.work_date, {
            workDate: day.work_date,
            checkIn: day.check_in,
            checkOut: day.check_out,
            source: "conform:pama",
            state: day.state,
            gap: day.gap,
            reason: day.reason,
            evidenceCount: day.evidence_count,
            correction: day.correction,
          });
        }
      }
      const evaluatedThrough = sourceLogs
        .map((data) => data.evaluated_through)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;
      return {
        source: "conform:pama",
        period: { label: calendar.prefix, year, month, start: calendar.start, end: calendar.end, evaluatedThrough },
        days: [...byDate.values()].sort((a, b) => a.workDate.localeCompare(b.workDate)),
      };
    },
  };
}

/** Actionable attendance gaps for exactly one Talent-facing calendar month. */
export async function conformMonthRequirements(employeeId: string, year: number, month: number): Promise<Requirement[]> {
  const calendar = calendarMonth(year, month);
  const sourceRequirements = await Promise.all(calendar.sourcePeriods.map((period) => conformRequirements(employeeId, period.year, period.month)));
  const byDate = new Map<string, Requirement>();
  for (const data of sourceRequirements) {
    for (const requirement of data.requirements) {
      if (requirement.work_date.startsWith(`${calendar.prefix}-`)) byDate.set(requirement.work_date, requirement);
    }
  }
  return [...byDate.values()].sort((a, b) => a.work_date.localeCompare(b.work_date));
}

const hhmm = (value: Date | string | null) =>
  value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) : null;

/** A backoffice user's own ERP clock-ins for a calendar month: first check-in and last check-out per day. */
export function nativeSource(sql: Sql, userId: string): AttendanceSource {
  return {
    key: "native",
    async log(year, month) {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const rows = await sql<{ work_date: string; first_in: Date | string; last_out: Date | string | null }[]>`
        SELECT work_date::text AS work_date, min(check_in_at) AS first_in, max(check_out_at) AS last_out
        FROM attendance_logs WHERE user_id=${userId} AND work_date >= ${start}::date AND work_date < (${start}::date + interval '1 month')
        GROUP BY work_date ORDER BY work_date`;
      const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      return {
        source: "native",
        period: { label: `${year}-${String(month).padStart(2, "0")}`, year, month, start, end, evaluatedThrough: null },
        days: rows.map((r) => ({
          workDate: r.work_date,
          checkIn: hhmm(r.first_in),
          checkOut: hhmm(r.last_out),
          source: "native",
          state: r.last_out ? "complete" : "needs_action",
          gap: r.last_out ? null : "missing_clock_out",
          reason: r.last_out ? "" : "Jam pulang belum tercatat",
          evidenceCount: 0,
          correction: null,
        })),
      };
    },
  };
}
