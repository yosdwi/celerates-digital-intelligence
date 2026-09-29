"use client";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { deleteActivity } from "../actions";

export function DeleteActivityButton({ activityId, clientId }: { activityId: string; clientId: string }) {
  const t = useTranslations("crm");
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(t("confirmDeleteActivity"))) return;
    startTransition(() => deleteActivity(activityId, clientId));
  }

  return (
    <button onClick={handleClick} disabled={isPending} className="text-slate-300 hover:text-red-500 transition-colors shrink-0" title={t("deleting")}>
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
