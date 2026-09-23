"use server";
import { integrationDisabled } from "@/lib/integration-policy";
import { db } from "@/db";
import { automationReminders, automationReminderRecipients, automationReminderLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { logActivity } from "@/lib/activity-log";
import { runReminder, type RunReminderResult } from "@/lib/automation/reminder-engine";

export async function createReminder(formData: FormData): Promise<void> {
  await integrationDisabled();

  const actor = await requireDivisionAccess("automation");

  const type = formData.get("type") as string;
  const name = formData.get("name") as string;
  const message_template = formData.get("message_template") as string;
  if (!type || !name || !message_template) throw new Error("Tipe, nama, dan template pesan wajib diisi");

  const dayRaw = formData.get("schedule_day_of_week") as string;
  const schedule_day_of_week = dayRaw ? Number(dayRaw) : null;
  const schedule_time = (formData.get("schedule_time") as string) || null;

  const recipientRaw = (formData.get("recipient_emails") as string) ?? "";
  const emails = [...new Set(recipientRaw.split(/[\n,;]+/).map((v) => v.trim()).filter(Boolean))];
  if (emails.length === 0) throw new Error("Tambahkan minimal 1 email recipient");

  const [reminder] = await db.insert(automationReminders).values({
    type, name, message_template, schedule_day_of_week, schedule_time,
    created_by_user_id: actor.userId,
  }).returning({ id: automationReminders.id });

  await db.insert(automationReminderRecipients).values(
    emails.map((email) => ({ reminder_id: reminder.id, channel: "email", target: email }))
  );

  await logActivity("automation", "create", `Reminder ${type}: ${name}`, "Reminder");
  revalidatePath("/automation/reminders");
}

export async function deleteReminder(id: string): Promise<void> {
  await integrationDisabled();

  await requireDivisionAccess("automation", "full");
  await db.delete(automationReminderLogs).where(eq(automationReminderLogs.reminder_id, id));
  await db.delete(automationReminderRecipients).where(eq(automationReminderRecipients.reminder_id, id));
  await db.delete(automationReminders).where(eq(automationReminders.id, id));
  await logActivity("automation", "delete", "Reminder dihapus", "Reminder");
  revalidatePath("/automation/reminders");
}

export async function toggleReminderActive(id: string, isActive: boolean): Promise<void> {
  await integrationDisabled();

  await requireDivisionAccess("automation");
  await db.update(automationReminders).set({ is_active: isActive }).where(eq(automationReminders.id, id));
  revalidatePath("/automation/reminders");
}

export type SendReminderResult = { ok: true; result: RunReminderResult } | { ok: false; error: string };

export async function sendReminderNow(id: string): Promise<SendReminderResult> {
  await integrationDisabled();

  try {
    await requireDivisionAccess("automation");
    const result = await runReminder(id);
    await logActivity("automation", "update", `Reminder dikirim manual (${result.sent} sukses, ${result.failed} gagal)`, "Reminder");
    revalidatePath("/automation/reminders");
    return { ok: true, result };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Gagal mengirim reminder" };
  }
}
