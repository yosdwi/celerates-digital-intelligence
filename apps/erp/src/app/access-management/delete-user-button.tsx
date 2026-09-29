"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { deleteUser } from "./actions";

export function DeleteUserButton({ userId, userName }: { userId: string; userName: string }) {
  const t = useTranslations("accessManagement");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirm(t("confirmDeleteUser", { userName }))) return;
    startTransition(async () => {
      setError(null);
      const result = await deleteUser(userId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="leading-none">
      <button onClick={handleClick} disabled={isPending} className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">
        {isPending ? t("deleting") : t("delete")}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}