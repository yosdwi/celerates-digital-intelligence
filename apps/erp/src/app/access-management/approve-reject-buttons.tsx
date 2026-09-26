"use client";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { approveUser, rejectUser } from "./actions";

export function ApproveRejectButtons({ userId }: { userId: string }) {
  const t = useTranslations("accessManagement");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex gap-1.5">
      <button
        disabled={isPending}
        onClick={() => startTransition(() => approveUser(userId))}
        className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        {t("approve")}
      </button>
      <button
        disabled={isPending}
        onClick={() => startTransition(() => rejectUser(userId))}
        className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700 disabled:opacity-50"
      >
        {t("reject")}
      </button>
    </div>
  );
}