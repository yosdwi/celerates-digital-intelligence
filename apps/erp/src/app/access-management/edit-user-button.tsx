"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateUserInfo } from "./actions";
import { OwnerToggle } from "./owner-toggle";
import { AccessEditor } from "./access-editor";
import { ConverterAccessToggle } from "./converter-access-toggle";

type DivisionOption = { id: string; name: string };
type AccessRow = { divisionId: string; level: string };

export function EditUserButton({
  userId,
  currentName,
  currentRole,
  isOwner,
  accountType,
  canUseTimesheetConverter,
  divisionOptions,
  currentAccess,
}: {
  userId: string;
  currentName: string;
  currentRole: string | null;
  isOwner: boolean;
  accountType: string;
  canUseTimesheetConverter: boolean;
  divisionOptions: DivisionOption[];
  currentAccess: AccessRow[];
}) {
  const t = useTranslations("accessManagement");
  const isTalent = accountType === "talent";
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      setError(null);
      const result = await updateUserInfo(userId, fd);
      if (!result.ok) setError(result.error);
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline">
        {t("edit")}
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-brand-200 bg-brand-50/50 p-4 space-y-4">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input name="full_name" defaultValue={currentName} required className="rounded border border-slate-300 px-2 py-1.5 text-xs flex-1" />
        <input name="role_title" defaultValue={currentRole ?? ""} placeholder={t("rolePlaceholder")} className="rounded border border-slate-300 px-2 py-1.5 text-xs flex-1" />
        <button type="submit" disabled={isPending} className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50 flex-shrink-0">
          {isPending ? "..." : t("saveName")}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </form>

      <div className="flex items-center gap-2 border-t border-brand-100 pt-3">
        <span className="text-xs font-medium text-slate-600">{t("ownerStatus")}:</span>
        <OwnerToggle userId={userId} initialIsOwner={isOwner} />
      </div>

      {isTalent ? (
        <div className="border-t border-brand-100 pt-3">
          <p className="text-xs font-medium text-slate-600 mb-2">{t("talentAccountTimesheetModule")}:</p>
          <ConverterAccessToggle userId={userId} initialEnabled={canUseTimesheetConverter} />
        </div>
      ) : (
        !isOwner && (
          <div className="border-t border-brand-100 pt-3">
            <p className="text-xs font-medium text-slate-600 mb-2">{t("accessPerDivision")}:</p>
            <AccessEditor userId={userId} divisionOptions={divisionOptions} currentAccess={currentAccess} />
          </div>
        )
      )}

      <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:underline">
        {t("close")}
      </button>
    </div>
  );
}