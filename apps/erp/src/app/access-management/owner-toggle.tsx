"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toggleOwner } from "./actions";

export function OwnerToggle({ userId, initialIsOwner }: { userId: string; initialIsOwner: boolean }) {
  const t = useTranslations("accessManagement");
  const [checked, setChecked] = useState(initialIsOwner);
  const [isPending, startTransition] = useTransition();

  function handleChange(value: boolean) {
    if (!confirm(value ? t("confirmMakeOwner") : t("confirmRevokeOwner"))) return;
    setChecked(value);
    startTransition(() => {
      toggleOwner(userId, value);
    });
  }

  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <input type="checkbox" checked={checked} disabled={isPending} onChange={(e) => handleChange(e.target.checked)} className="rounded" />
      {t("owner")}
    </label>
  );
}