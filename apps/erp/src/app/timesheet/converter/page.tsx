import { getTranslations } from "next-intl/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { companyHolidays, timesheetExports, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getAttachmentsWithUrlsForMany } from "@/lib/attachments";
import { PageHeader } from "@/components/page-header";
import { ExpandableSection } from "@/components/expandable-section";
import { FileSpreadsheet } from "lucide-react";
import { ConverterPanel } from "./converter-panel";
import { ExportsHistory } from "./exports-history";
import { HolidaysPanel } from "../holidays-panel";
import { CONVERTER_DEFAULT_CLIENT, TIMESHEET_EXPORT_SOURCE, MONTH_NAMES_ID } from "../constants";

export default async function TimesheetConverterPage() {
  const t = await getTranslations("timesheet");
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const userId = (session.user as any).id as string;
  const isOwner = Boolean((session.user as any).isOwner);
  const accountType = ((session.user as any).accountType ?? "backoffice") as string;
  const canConverter = Boolean((session.user as any).canUseTimesheetConverter);
  const access = ((session.user as any).access ?? []) as { divisionKey: string; level: string }[];
  const isPmoFull = isOwner || access.some((a) => a.divisionKey === "pmo" && a.level === "full");
  const isTalent = accountType === "talent";
  const isEligible = isPmoFull || (isTalent && canConverter);

  if (!isEligible) redirect("/timesheet");

  const defaultName = ((session.user as any).fullName ?? session.user.name ?? "") as string;

  const [holidayRows, exportRowsRaw] = await Promise.all([
    db.select().from(companyHolidays).orderBy(desc(companyHolidays.date)),
    db
      .select({
        id: timesheetExports.id,
        client_name: timesheetExports.client_name,
        period_year: timesheetExports.period_year,
        period_month: timesheetExports.period_month,
        total_hours: timesheetExports.total_hours,
        total_md: timesheetExports.total_md,
        generated_by_name: timesheetExports.generated_by_name,
        created_at: timesheetExports.created_at,
        talent_name: users.full_name,
      })
      .from(timesheetExports)
      .leftJoin(users, eq(timesheetExports.user_id, users.id))
      .where(isPmoFull ? undefined : eq(timesheetExports.user_id, userId))
      .orderBy(desc(timesheetExports.created_at)),
  ]);

  const exportAttachmentsByRow = await getAttachmentsWithUrlsForMany(TIMESHEET_EXPORT_SOURCE, exportRowsRaw.map((r) => r.id));
  const exportRows = exportRowsRaw.map((r) => ({
    ...r,
    talent_label: r.talent_name ?? "-",
    period_label: `${MONTH_NAMES_ID[r.period_month - 1]} ${r.period_year}`,
    attachments: exportAttachmentsByRow[r.id] ?? [],
  }));

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={FileSpreadsheet}
        color="bg-purple-500"
        eyebrow="Timesheet"
        title={t("converterTitle", { client: CONVERTER_DEFAULT_CLIENT })}
        subtitle={t("converterSubtitle")}
      />

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <ExpandableSection title={t("uploadSectionTitle")}>
          <ConverterPanel isPmoFull={isPmoFull} defaultTalentName={isTalent ? defaultName : ""} />
        </ExpandableSection>

        <ExpandableSection title={t("exportHistoryTitle", { count: exportRows.length })}>
          <ExportsHistory data={exportRows} />
        </ExpandableSection>

        <ExpandableSection title={t("holidayCalendarTitle", { count: holidayRows.length })}>
          <HolidaysPanel data={holidayRows} canDelete={isPmoFull} />
        </ExpandableSection>
      </main>
    </div>
  );
}
