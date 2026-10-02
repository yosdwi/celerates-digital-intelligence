"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useStepUp } from "@/components/security/step-up";
import { toggleOwner } from "./actions";

export function OwnerToggle({ userId, initialIsOwner }: { userId: string; initialIsOwner: boolean }) {
  const t = useTranslations("accessManagement");
  const [checked, setChecked] = useState(initialIsOwner);
  const [isPending, startTransition] = useTransition();
  const { ensure, dialog } = useStepUp();

  function handleChange(value: boolean) {
    if (!confirm(value ? t("confirmMakeOwner") : t("confirmRevokeOwner"))) return;
    startTransition(async () => {
      // Granting Owner needs a fresh "confirm it's you" (docs/security/03).
      let result = await toggleOwner(userId, value);
      if (!result.ok && result.error === "step_up_required" && (await ensure())) result = await toggleOwner(userId, value);
      if (result.ok) setChecked(value);
    });
  }

  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <input type="checkbox" checked={checked} disabled={isPending} onChange={(e) => handleChange(e.target.checked)} className="rounded" />
      {t("owner")}
      {dialog}
    </label>
  );
}
