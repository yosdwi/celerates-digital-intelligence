// Talent drill-down (doc 21 §7): ConForm requirements and corrections for one Talent, whether WhatsApp is bound,
// and the Celerates account link (Owner links; the link is what makes a reminder a personal Celerates deep link).
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { sql } from "@/db";
import { requireDivisionRead } from "@/lib/module-guard";
import { ConformError, type TalentLookup, type TalentRequirements, type TalentTasks } from "@/lib/conform/client";
import { canPmo, conformLookup, conformRequirements, conformTasks, cycleLabelFor, jakartaToday } from "@/lib/conform/pmo";
import { conformSource, type AttendanceLog } from "@/lib/attendance/source";
import { fmtDate } from "@/lib/pmo/mobile-format";
import { activeLinksForEmployees } from "@/lib/talent/identity";
import { Card, FactRows, MobileScreen, StatusPill } from "@/components/mobile/primitives";
import { RecordHeader, Section } from "@/components/mobile/record";
import { LinkTalentForm } from "@/components/conform/link-talent";
import { TalentMessageButton } from "@/components/conform/talent-message";
import { AttendanceRow } from "@/components/talent/attendance-row";

export const dynamic = "force-dynamic";

export default async function ReadinessTalentPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ year?: string; month?: string }> }) {
  const { levels } = await requireDivisionRead("pmo");
  const employeeId = decodeURIComponent((await params).ref);
  if (!employeeId || employeeId.length > 120) notFound();
  const t = await getTranslations("conform");
  const locale = await getLocale();
  const sp = await searchParams;
  const cycle = Number(sp.year) && Number(sp.month) ? { year: Number(sp.year), month: Number(sp.month) } : cycleLabelFor(jakartaToday());
  let talent: TalentLookup;
  let data: TalentRequirements;
  try {
    [talent, data] = await Promise.all([conformLookup(employeeId), conformRequirements(employeeId, cycle.year, cycle.month)]);
  } catch (error) {
    if (error instanceof ConformError && error.status === 404) notFound();
    throw error;
  }
  // Secondary reads degrade on their own: the record still renders when ConForm cannot serve the log or tasks.
  const [log, tasks] = await Promise.all([
    conformSource(employeeId).log(cycle.year, cycle.month).catch((error: unknown): AttendanceLog | null => {
      if (error instanceof ConformError) return null;
      throw error;
    }),
    conformTasks(employeeId, data.cycle.year, data.cycle.month).catch((error: unknown): TalentTasks | null => {
      if (error instanceof ConformError) return null;
      throw error;
    }),
  ]);
  const link = (await activeLinksForEmployees(sql, [employeeId])).get(employeeId) ?? null;
  const needs = data.requirements.filter((r) => r.state === "needs_action").length;
  const account = link ? await sql`SELECT email FROM users WHERE id=${link.user_id}` : [];

  return (
    <MobileScreen label={talent.name}>
      <RecordHeader
        back={{ href: `/pmo/readiness?year=${cycle.year}&month=${cycle.month}`, label: t("title") }}
        eyebrow={`${t("title")} · ${data.cycle.label}`}
        title={talent.name}
        subtitle={[talent.nrp, talent.role].join(" · ")}
        pills={[
          { label: t(`status.${data.talent.status}`), tone: data.talent.status === "COMPLETE" ? "ok" : data.talent.status === "WAITING_SUBMITTED" ? "accent" : "warn" },
          { label: talent.whatsapp_bound ? t("waBound") : t("waNotBound"), tone: talent.whatsapp_bound ? "muted" : "danger" },
        ]}
      />
      <Section id="requirements" title={t("requirements")}>
        {data.requirements.length === 0 ? (
          <Card className="p-3.5 text-sm text-j-muted">{t("noRequirements")}</Card>
        ) : (
          <Card className="px-3.5 py-1">
            <ul className="divide-y divide-j-line-soft">
              {data.requirements.map((r) => (
                <li key={r.requirement_id} className="flex items-center justify-between gap-3 py-2.5 text-sm" data-requirement={r.work_date}>
                  <span className="min-w-0">
                    <span className="block font-semibold">{fmtDate(r.work_date, locale)}</span>
                    <span className="block truncate text-xs text-j-muted">{t(`gap.${r.gap}`)}{r.correction?.rejection_reason ? ` · ${r.correction.rejection_reason}` : ""}</span>
                  </span>
                  <StatusPill tone={r.state === "needs_action" ? "warn" : "accent"}>{r.state === "needs_action" ? t("status.NEEDS_TALENT_ACTION") : t("status.WAITING_SUBMITTED")}</StatusPill>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>
      {link && talent.whatsapp_bound && canPmo(levels.pmo ?? null, "editor") && (
        <div className="flex" data-record-section="message">
          <TalentMessageButton employeeId={employeeId} name={talent.name} year={cycle.year} month={cycle.month} needs={needs} missingTasks={tasks?.summary.missing ?? 0} />
        </div>
      )}
      <Section id="attendance" title={t("attendanceLog")}>
        {!log ? (
          <Card className="p-3.5 text-sm text-j-muted">{t("unavailable")}</Card>
        ) : (
          <Card className="px-3.5 py-1">
            <ul className="divide-y divide-j-line-soft">
              {[...log.days].reverse().filter((d) => d.state !== "not_required" || d.checkIn || d.checkOut).map((day) => (
                <li key={day.workDate}>
                  <AttendanceRow day={day} locale={locale} href={null} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>
      <Section id="tasks" title={t("tasksTitle", { period: tasks?.period.label ?? "" })}>
        {!tasks ? (
          <Card className="p-3.5 text-sm text-j-muted">{t("unavailable")}</Card>
        ) : (
          <FactRows
            rows={[
              { label: t("tasks.total"), value: String(tasks.summary.total) },
              { label: t("tasks.complete"), value: String(tasks.summary.complete) },
              { label: t("tasks.missing"), value: String(tasks.summary.missing) },
            ]}
          />
        )}
      </Section>
      <Section id="account" title={t("account.title")}>
        {link ? (
          <FactRows
            rows={[
              { label: t("account.email"), value: String(account[0]?.email ?? "—") },
              { label: t("account.linkedAt"), value: fmtDate(new Date(link.created_at).toISOString().slice(0, 10), locale) },
            ]}
          />
        ) : levels.pmo === "full" ? (
          <LinkTalentForm employeeId={employeeId} />
        ) : (
          <Card className="p-3.5 text-sm text-j-muted">{t("account.ownerOnly")}</Card>
        )}
        <p className="text-xs text-j-muted">{t("account.note")}</p>
      </Section>
    </MobileScreen>
  );
}
