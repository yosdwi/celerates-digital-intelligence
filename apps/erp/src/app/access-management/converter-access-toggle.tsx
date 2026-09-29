"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toggleTimesheetConverterAccess } from "./actions";

export function ConverterAccessToggle({ userId, initialEnabled }: { userId: string; initialEnabled: boolean }) {
  const t = useTranslations("accessManagement");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    setEnabled(next);
    startTransition(() => {
      toggleTimesheetConverterAccess(userId, next);
    });
  }

  return (
    <label className="flex items-center gap-2 text-xs text-slate-600">
      <input
        type="checkbox"
        checked={enabled}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.checked)}
        className="rounded border-slate-300"
      />
      {t("converterAccessLabel")}
    </label>
  );
}
