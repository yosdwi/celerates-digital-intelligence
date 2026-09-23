import { db } from "@/db";
import { automationReminders, automationReminderRecipients, automationReminderLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendViaChannel, type ReminderChannel } from "./channels";

const REMINDER_TYPE_LABELS: Record<string, string> = {
  absensi: "Reminder Absensi",
  timesheet: "Reminder Timesheet",
};

/** Render placeholder sederhana di template freetext -- {{tanggal}} & {{hari}}. */
function renderTemplate(template: string): string {
  const now = new Date();
  const tanggal = now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const hari = now.toLocaleDateString("id-ID", { weekday: "long" });
  return template.replaceAll("{{tanggal}}", tanggal).replaceAll("{{hari}}", hari);
}

export type RunReminderResult = {
  sent: number;
  failed: number;
  errors: { target: string; error: string }[];
};

/**
 * Kirim 1 reminder ke semua recipient-nya, catat hasil per-target ke
 * automation_reminder_logs. Dipanggil baik dari tombol "Kirim Sekarang" (UI)
 * maupun dari endpoint cron (/api/cron/reminders) -- satu-satunya jalur
 * pengiriman supaya perilakunya konsisten dari kedua trigger itu.
 */
export async function runReminder(reminderId: string): Promise<RunReminderResult> {
  const [reminder] = await db.select().from(automationReminders).where(eq(automationReminders.id, reminderId));
  if (!reminder) throw new Error("Reminder tidak ditemukan");

  const recipients = await db.select().from(automationReminderRecipients).where(eq(automationReminderRecipients.reminder_id, reminderId));
  if (recipients.length === 0) throw new Error("Reminder ini belum punya recipient");

  const subject = REMINDER_TYPE_LABELS[reminder.type] ?? reminder.name;
  const message = renderTemplate(reminder.message_template);

  const result: RunReminderResult = { sent: 0, failed: 0, errors: [] };

  for (const recipient of recipients) {
    try {
      await sendViaChannel(recipient.channel as ReminderChannel, recipient.target, subject, message);
      await db.insert(automationReminderLogs).values({
        reminder_id: reminderId, channel: recipient.channel, target: recipient.target, status: "sent",
      });
      result.sent++;
    } catch (err: any) {
      const errorMessage = err?.message ?? "Gagal mengirim";
      await db.insert(automationReminderLogs).values({
        reminder_id: reminderId, channel: recipient.channel, target: recipient.target, status: "failed", error_message: errorMessage,
      });
      result.failed++;
      result.errors.push({ target: recipient.target, error: errorMessage });
    }
  }

  return result;
}

/** Dipakai endpoint cron -- reminder aktif yang jadwal hari-nya cocok dengan hari ini. */
export async function getDueReminders() {
  const today = new Date().getDay(); // 0=Minggu..6=Sabtu
  const reminders = await db.select().from(automationReminders).where(eq(automationReminders.is_active, true));
  return reminders.filter((r) => r.schedule_day_of_week === today);
}
