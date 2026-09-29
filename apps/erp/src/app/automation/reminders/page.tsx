import { db } from "@/db";
import { automationReminders, automationReminderRecipients } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AddRecordModal } from "@/components/add-record-modal";
import { Field, SelectField } from "@/components/form-fields";
import { Bot } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createReminder } from "./actions";
import { REMINDER_TYPES, DAYS_OF_WEEK } from "../constants";
import { RemindersTable } from "./reminders-table";

export default async function RemindersPage() {
  const t = await getTranslations("automation");
  const reminderTypeOptions = REMINDER_TYPES.map(([value]) => [value, t(`reminderType.${value}`)] as const);
  const dayOfWeekOptions = DAYS_OF_WEEK.map(([value]) => [value, t(`dayOfWeek.${value}`)] as const);
  const reminders = await db.select().from(automationReminders).orderBy(desc(automationReminders.created_at));
  const allRecipients = await db.select().from(automationReminderRecipients);

  const rows = reminders.map((r) => ({
    ...r,
    recipients: allRecipients.filter((rec) => rec.reminder_id === r.id),
  }));

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Bot}
        color="bg-indigo-600"
        eyebrow={t("eyebrow")}
        title={t("reminders.pageTitle")}
        subtitle={t("reminders.subtitle")}
      />

      <main className="px-8 py-8 space-y-8 max-w-6xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t("reminders.statTotal")} value={rows.length} color="navy" />
          <StatCard label={t("reminders.statActive")} value={rows.filter((r) => r.is_active).length} color="green" />
          <StatCard label={t("reminderType.absensi")} value={rows.filter((r) => r.type === "absensi").length} color="blue" />
          <StatCard label={t("reminderType.timesheet")} value={rows.filter((r) => r.type === "timesheet").length} color="purple" />
        </div>

        <div className="flex justify-end">
          <AddRecordModal buttonLabel={t("reminders.createNew")} title={t("reminders.createNew")} action={createReminder}>
            <SelectField label={t("reminders.typeLabel")} name="type" options={reminderTypeOptions} required />
            <div className="sm:col-span-2">
              <Field label={t("reminders.nameLabel")} name="name" placeholder={t("reminders.namePlaceholder")} required />
            </div>

            <div className="sm:col-span-3">
              <Field
                label={t("reminders.messageTemplateLabel")}
                name="message_template"
                textarea
                rows={5}
                required
                placeholder={t("reminders.messageTemplatePlaceholder")}
                hint={t("reminders.messageTemplateHint")}
              />
            </div>

            <SelectField label={t("reminders.scheduleDayLabel")} name="schedule_day_of_week" options={dayOfWeekOptions} />
            <Field label={t("reminders.scheduleTimeLabel")} name="schedule_time" placeholder="09:00" />

            <div className="sm:col-span-3">
              <Field
                label={t("reminders.recipientEmailLabel")}
                name="recipient_emails"
                textarea
                rows={3}
                required
                placeholder={"hr@company.com\npmo@company.com"}
              />
            </div>
          </AddRecordModal>
        </div>

        <RemindersTable rows={rows} />
      </main>
    </div>
  );
}
