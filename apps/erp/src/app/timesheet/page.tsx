import { getTranslations } from "next-intl/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { companyHolidays, timesheetSubmissions, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getAttachmentsWithUrlsForMany } from "@/lib/attachments";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ExpandableSection } from "@/components/expandable-section";
import { Clock } from "lucide-react";
import { TIMESHEET_SUBMISSION_SOURCE } from "./constants";
import { SubmissionsTable } from "./submissions-table";
import { HolidaysPanel } from "./holidays-panel";

export default async function TimesheetTrackerPage() {
  const t = await getTranslations("timesheet");
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const userId = (session.user as any).id as string;
  const isOwner = Boolean((session.user as any).isOwner);
  const accountType = ((session.user as any).accountType ?? "backoffice") as string;
  const access = ((session.user as any).access ?? []) as { divisionKey: string; level: string }[];
  const isPmoFull = isOwner || access.some((a) => a.divisionKey === "pmo" && a.level === "full");
  const isTalent = accountType === "talent";

  // Talent yang belum eligible & bukan PMO-full tidak boleh lihat apa-apa di sini.
  if (!isTalent && !isPmoFull) redirect("/");

  const [holidayRows, submissionRows] = await Promise.all([
    db.select().from(companyHolidays).orderBy(desc(companyHolidays.date)),
    isPmoFull
      ? db
          .select({
            id: timesheetSubmissions.id,
            user_id: timesheetSubmissions.user_id,
            client_name: timesheetSubmissions.client_name,
            period_start: timesheetSubmissions.period_start,
            period_end: timesheetSubmissions.period_end,
            status_code: timesheetSubmissions.status_code,
            approved_at: timesheetSubmissions.approved_at,
            approved_by_name: timesheetSubmissions.approved_by_name,
            created_at: timesheetSubmissions.created_at,
            talent_name: users.full_name,
          })
          .from(timesheetSubmissions)
          .leftJoin(users, eq(timesheetSubmissions.user_id, users.id))
          .orderBy(desc(timesheetSubmissions.created_at))
      : db
          .select({
            id: timesheetSubmissions.id,
            user_id: timesheetSubmissions.user_id,
            client_name: timesheetSubmissions.client_name,
            period_start: timesheetSubmissions.period_start,
            period_end: timesheetSubmissions.period_end,
            status_code: timesheetSubmissions.status_code,
            approved_at: timesheetSubmissions.approved_at,
            approved_by_name: timesheetSubmissions.approved_by_name,
            created_at: timesheetSubmissions.created_at,
            talent_name: users.full_name,
          })
          .from(timesheetSubmissions)
          .leftJoin(users, eq(timesheetSubmissions.user_id, users.id))
          .where(eq(timesheetSubmissions.user_id, userId))
          .orderBy(desc(timesheetSubmissions.created_at)),
  ]);

  const submissionAttachmentsByRow = await getAttachmentsWithUrlsForMany(TIMESHEET_SUBMISSION_SOURCE, submissionRows.map((r) => r.id));

  const submissionsWithUrl = submissionRows.map((r) => ({
    ...r,
    talent_label: r.talent_name ?? "-",
    attachments: submissionAttachmentsByRow[r.id] ?? [],
  }));

  const reviewCount = submissionRows.filter((s) => s.status_code === "review").length;
  const approvedCount = submissionRows.filter((s) => s.status_code === "approved").length;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Clock}
        color="bg-purple-500"
        eyebrow="Timesheet"
        title={t("trackerTitle")}
        subtitle={
          isPmoFull
            ? t("trackerSubtitlePmo")
            : t("trackerSubtitleTalent")
        }
      />

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label={t("totalSubmission")} value={submissionRows.length} color="navy" />
          <StatCard label={t("waitingReview")} value={reviewCount} color="amber" />
          <StatCard label={t("approved")} value={approvedCount} color="green" />
        </div>

        <ExpandableSection title={t("submissionSectionTitle", { count: submissionRows.length })}>
          <SubmissionsTable data={submissionsWithUrl} isPmoFull={isPmoFull} currentUserId={userId} />
        </ExpandableSection>

        {isPmoFull && (
          <ExpandableSection title={t("holidayCalendarTitle", { count: holidayRows.length })}>
            <HolidaysPanel data={holidayRows} />
          </ExpandableSection>
        )}
      </main>
    </div>
  );
}
