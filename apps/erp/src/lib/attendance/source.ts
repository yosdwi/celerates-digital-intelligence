// Attendance sources (doc 22 R4.1). The ERP shows attendance from more than one system of record behind one shape:
// "native" is the ERP's own clock-in/out (attendance_logs); "conform" reads a linked Talent's client attendance
// (PAMA) from ConForm on demand. Nothing is copied: ConForm stays the record for client attendance.
import type { Sql } from "postgres";
import type { AttendanceDayState, Requirement } from "@/lib/conform/client";
import { conformAttendance } from "@/lib/conform/pmo";

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

/** A linked Talent's client attendance for one calendar-month Timesheet view, as ConForm evaluates it. */
export function conformSource(employeeId: string): AttendanceSource {
  return {
    key: "conform:pama",
    async log(year, month) {
      const data = await conformAttendance(employeeId, year, month);
      return {
        source: "conform:pama",
        period: { label: data.cycle.label, year: data.cycle.year, month: data.cycle.month, start: data.cycle.start, end: data.cycle.end, evaluatedThrough: data.evaluated_through },
        days: data.days.map((d) => ({
          workDate: d.work_date,
          checkIn: d.check_in,
          checkOut: d.check_out,
          source: "conform:pama",
          state: d.state,
          gap: d.gap,
          reason: d.reason,
          evidenceCount: d.evidence_count,
          correction: d.correction,
        })),
      };
    },
  };
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
