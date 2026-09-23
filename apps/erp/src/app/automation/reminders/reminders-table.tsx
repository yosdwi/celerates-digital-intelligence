"use client";
import { useState, useTransition } from "react";
import { Send, Trash2, Power } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/toast-provider";
import { Pill } from "@/components/pill";
import { sendReminderNow, deleteReminder, toggleReminderActive } from "./actions";
import { REMINDER_TYPES, DAYS_OF_WEEK } from "../constants";

type Recipient = { id: string; channel: string; target: string };
type Row = {
  id: string;
  type: string;
  name: string;
  message_template: string;
  schedule_day_of_week: number | null;
  schedule_time: string | null;
  is_active: boolean;
  recipients: Recipient[];
};

export function RemindersTable({ rows }: { rows: Row[] }) {
  const t = useTranslations("automation");
  const reminderTypeLabels: Record<string, string> = Object.fromEntries(
    REMINDER_TYPES.map(([value]) => [value, t(`reminderType.${value}`)])
  );
  const dayLabels: Record<string, string> = Object.fromEntries(
    DAYS_OF_WEEK.map(([value]) => [value, t(`dayOfWeek.${value}`)])
  );
  const [tab, setTab] = useState<string>("all");
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  const filtered = tab === "all" ? rows : rows.filter((r) => r.type === tab);

  function handleSend(id: string) {
    startTransition(async () => {
      const res = await sendReminderNow(id);
      if (res.ok) {
        showToast(t("reminders.sendResult", { sent: res.result.sent, failed: res.result.failed }), res.result.failed > 0 ? "error" : "success");
      } else {
        showToast(res.error, "error");
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm(t("reminders.confirmDelete"))) return;
    startTransition(async () => {
      try {
        await deleteReminder(id);
        showToast(t("reminders.deleted"));
      } catch (e: any) {
        showToast(e.message ?? t("deleteFailed"), "error");
      }
    });
  }

  function handleToggle(id: string, next: boolean) {
    startTransition(async () => {
      await toggleReminderActive(id, next);
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex gap-1 border-b border-slate-200 px-4 pt-3">
        {[["all", t("reminders.tabAll")], ...REMINDER_TYPES.map(([value]) => [value, reminderTypeLabels[value]])].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${tab === key ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-800"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="divide-y divide-slate-100">
        {filtered.length === 0 && (
          <p className="text-sm text-slate-400 py-10 text-center">{t("reminders.noRemindersYet")}</p>
        )}
        {filtered.map((row) => (
          <div key={row.id} className="px-6 py-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{reminderTypeLabels[row.type]}</span>
                {!row.is_active && <Pill variant="neutral">{t("reminders.inactive")}</Pill>}
              </div>
              <p className="font-medium text-slate-900 mt-0.5">{row.name}</p>
              <p className="text-xs text-slate-500 mt-1 whitespace-pre-line line-clamp-2">{row.message_template}</p>
              <p className="text-xs text-slate-400 mt-1">
                {t("reminders.recipientCount", { count: row.recipients.length })} &middot; {t("reminders.scheduleLabel")} {row.schedule_day_of_week !== null ? dayLabels[String(row.schedule_day_of_week)] : "-"} {row.schedule_time ?? ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                disabled={isPending}
                onClick={() => handleSend(row.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> {t("reminders.sendNow")}
              </button>
              <button
                disabled={isPending}
                onClick={() => handleToggle(row.id, !row.is_active)}
                title={row.is_active ? t("reminders.deactivate") : t("reminders.activate")}
                className="rounded-lg border border-slate-300 p-1.5 text-slate-500 hover:bg-violet-50/60 disabled:opacity-50"
              >
                <Power className="h-3.5 w-3.5" />
              </button>
              <button
                disabled={isPending}
                onClick={() => handleDelete(row.id)}
                title={t("deleteTitle")}
                className="rounded-lg border border-slate-300 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
