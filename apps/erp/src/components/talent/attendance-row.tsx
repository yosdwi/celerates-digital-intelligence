// One day of an attendance log (doc 22 R4.3–R4.4), shared by the Talent's Absensi and the PMO Talent record.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import type { AttendanceDay } from "@/lib/attendance/source";
import { fmtDate } from "@/lib/pmo/mobile-format";
import { StatusPill } from "@/components/mobile/primitives";

const TONE = { complete: "ok", excused: "ok", needs_action: "warn", waiting_review: "accent", unverified: "muted", not_required: "muted" } as const;

export async function AttendanceRow({ day, locale, href }: { day: AttendanceDay; locale: string; href: string | null }) {
  const t = await getTranslations("talent.log");
  const rejected = day.state === "needs_action" && day.correction?.status === "rejected";
  const absence = day.state === "excused" ? day.correction?.absence_type : null;
  const times = day.state === "not_required" && !day.checkIn && !day.checkOut ? t("offDay") : `${day.checkIn ?? "--:--"} – ${day.checkOut ?? "--:--"}`;
  const corrected = day.correction?.status === "approved" && (day.correction.proposed_check_in || day.correction.proposed_check_out);
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-[14px] font-semibold ${day.state === "not_required" ? "text-j-muted" : ""}`}>{fmtDate(day.workDate, locale)}</span>
        <span className="truncate text-xs text-j-muted">
          {times}
          {corrected ? ` · ${t("corrected", { time: [day.correction?.proposed_check_in, day.correction?.proposed_check_out].filter(Boolean).join(" – ") })}` : ""}
        </span>
      </span>
      <StatusPill tone={rejected ? "danger" : TONE[day.state]}>{rejected ? t("state.rejected") : absence ? t("absence", { type: absence }) : t(`state.${day.state}`)}</StatusPill>
      {href && <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-j-faint" />}
    </>
  );
  return href ? (
    <Link href={href} className="flex min-h-[52px] items-center gap-3 py-2" data-attendance-day={day.workDate} data-attendance-state={day.state}>
      {body}
    </Link>
  ) : (
    <div className="flex min-h-[52px] items-center gap-3 py-2" data-attendance-day={day.workDate} data-attendance-state={day.state}>
      {body}
    </div>
  );
}
