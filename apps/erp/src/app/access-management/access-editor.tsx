"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { setUserAccess } from "./actions";

type DivisionOption = { id: string; name: string };
type AccessRow = { divisionId: string; level: string };

export function AccessEditor({
  userId,
  divisionOptions,
  currentAccess,
}: {
  userId: string;
  divisionOptions: DivisionOption[];
  currentAccess: AccessRow[];
}) {
  const t = useTranslations("accessManagement");
  const [isPending, startTransition] = useTransition();
  const [localAccess, setLocalAccess] = useState<Record<string, string>>(
    Object.fromEntries(divisionOptions.map((d) => [d.id, currentAccess.find((a) => a.divisionId === d.id)?.level ?? "none"]))
  );

  function handleChange(divisionId: string, level: string) {
    setLocalAccess((prev) => ({ ...prev, [divisionId]: level }));
    startTransition(() => {
      setUserAccess(userId, divisionId, level);
    });
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {divisionOptions.map((d) => (
        <label key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
          <span className="text-xs text-slate-600">{d.name}</span>
          <select
            value={localAccess[d.id]}
            disabled={isPending}
            onChange={(e) => handleChange(d.id, e.target.value)}
            className="text-xs rounded border border-slate-300 px-1 py-0.5 disabled:opacity-50"
          >
            <option value="none">-</option>
            <option value="viewer">{t("levelViewer")}</option>
            <option value="editor">{t("levelEditor")}</option>
            <option value="full">{t("levelFull")}</option>
          </select>
        </label>
      ))}
    </div>
  );
}