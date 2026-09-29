"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateProfile, changePassword } from "./actions";

export function ProfileForm({
  user,
}: {
  user: { full_name: string; role_title: string | null; email: string; hasPassword: boolean };
}) {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateProfile(fd);
      setProfileMsg(result.ok ? { type: "ok", text: t("profileUpdated") } : { type: "error", text: result.error });
    });
  }

  function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await changePassword(fd);
      setPasswordMsg(result.ok ? { type: "ok", text: t("passwordChanged") } : { type: "error", text: result.error });
      if (result.ok) e.currentTarget.reset();
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleProfileSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">{t("profileInfo")}</h2>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
          <input value={user.email} disabled className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">{t("fullName")}</span>
          <input name="full_name" defaultValue={user.full_name} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">{t("roleTitle")}</span>
          <input name="role_title" defaultValue={user.role_title ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        {profileMsg && <p className={`text-sm ${profileMsg.type === "ok" ? "text-green-600" : "text-red-600"}`}>{profileMsg.text}</p>}
        <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {tc("save")}
        </button>
      </form>

      {user.hasPassword && (
        <form onSubmit={handlePasswordSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">{t("changePassword")}</h2>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{t("currentPassword")}</span>
            <input name="current_password" type="password" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{t("newPassword")}</span>
            <input name="new_password" type="password" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{t("confirmNewPassword")}</span>
            <input name="confirm_password" type="password" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          {passwordMsg && <p className={`text-sm ${passwordMsg.type === "ok" ? "text-green-600" : "text-red-600"}`}>{passwordMsg.text}</p>}
          <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {t("changePassword")}
          </button>
        </form>
      )}
    </div>
  );
}