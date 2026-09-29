"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { inviteUser } from "./actions";

export function InviteUserForm({ divisionOptions }: { divisionOptions: { id: string; name: string }[] }) {
  const t = useTranslations("accessManagement");
  const [makeOwner, setMakeOwner] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await inviteUser(fd);
      if (!result.ok) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setMessage({ type: "ok", text: t("inviteSuccess") });
      e.currentTarget.reset();
      setMakeOwner(false);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <input name="email" type="email" placeholder={t("emailPlaceholder")} required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <input name="full_name" placeholder={t("fullNamePlaceholder")} required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />

      {!makeOwner && (
        <>
          <select name="division_id" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">{t("selectDivisionPlaceholder")}</option>
            {divisionOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select name="level" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">{t("selectLevelPlaceholder")}</option>
            <option value="viewer">{t("levelViewer")}</option>
            <option value="editor">{t("levelEditor")}</option>
            <option value="full">{t("levelFull")}</option>
          </select>
        </>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
        <input type="checkbox" name="make_owner" checked={makeOwner} onChange={(e) => setMakeOwner(e.target.checked)} className="rounded" />
        {t("makeOwnerLabel")}
      </label>

      {message && <p className={`sm:col-span-2 text-sm ${message.type === "ok" ? "text-green-600" : "text-red-600"}`}>{message.text}</p>}

      <div className="sm:col-span-2">
        <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {isPending ? t("inviting") : t("inviteUser")}
        </button>
      </div>
    </form>
  );
}