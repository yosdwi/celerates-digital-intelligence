"use client";
// Talent client pieces (doc 21 §6), Jernih: the account sheet and the "Lengkapi" correction sheet.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Camera, CheckCircle2, LogOut, Send } from "lucide-react";
import { submitAttendanceCorrection } from "@/app/me/actions";
import type { Requirement } from "@/lib/conform/client";
import { BottomSheet } from "@/components/mobile/primitives";
import { buttonClass } from "@/components/mobile/styles";

const field = "mt-1 w-full rounded-xl border border-[#d5dbe5] bg-j-surface px-3 py-2.5 text-[15px] font-normal text-j-ink outline-none focus:border-j-accent";

export function TalentAccountButton({ name, email }: { name: string; email: string }) {
  const t = useTranslations("talent");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label={t("account")} onClick={() => setOpen(true)} data-talent-account className="flex h-11 w-11 items-center justify-center rounded-full bg-[#dde5f7] text-sm font-extrabold text-j-accent-strong">
        {(name || "?").charAt(0).toUpperCase()}
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t("account")}>
        <div className="flex flex-col gap-4 pb-2">
          <div>
            <p className="text-base font-bold">{name}</p>
            <p className="text-sm text-j-muted">{email}</p>
          </div>
          <p className="text-xs text-j-muted">{t("accountNote")}</p>
          <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="flex h-12 items-center justify-center gap-2 rounded-[14px] border border-[#f3c7c2] text-[15px] font-bold text-[#b3261e]">
            <LogOut aria-hidden className="h-5 w-5" /> {t("logout")}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}

function newNonce() {
  return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "");
}

export function CorrectionSheet({ requirement }: { requirement: Requirement }) {
  const t = useTranslations("talent.fix");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<string>(requirement.allowed_actions[0] ?? "worked");
  const [nonce, setNonce] = useState(newNonce);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const worked = action === "worked";
  const needIn = worked && requirement.gap !== "missing_clock_out";
  const needOut = worked && requirement.gap !== "missing_clock_in";
  const submit = (form: HTMLFormElement) => {
    setError(null);
    const data = new FormData(form);
    data.set("work_date", requirement.work_date);
    data.set("action", action);
    data.set("nonce", nonce);
    start(async () => {
      const result = await submitAttendanceCorrection(data);
      if (!result.ok) return setError(result.error);
      setDone(result.status === "already_open" ? t("alreadyOpen") : t("submitted"));
      router.refresh();
    });
  };
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setNonce(newNonce()); setDone(null); }} data-action="talent-fix" className={buttonClass.primary}>
        {t("open")}
      </button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("title")}
        footer={
          done ? (
            <button type="button" onClick={() => setOpen(false)} className={buttonClass.primary}>
              {t("close")}
            </button>
          ) : (
            <button type="submit" form="talent-fix-form" disabled={pending} data-action="talent-fix-submit" className={`${buttonClass.primary} disabled:opacity-50`}>
              <Send aria-hidden className="h-[18px] w-[18px]" /> {pending ? t("sending") : t("submit")}
            </button>
          )
        }
      >
        {done ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center" role="status" data-fix-done>
            <CheckCircle2 aria-hidden className="h-10 w-10 text-j-ok" />
            <p className="text-[15px] font-bold">{done}</p>
            <p className="text-sm text-j-muted">{t("doneBody")}</p>
          </div>
        ) : (
          <form id="talent-fix-form" onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} className="flex flex-col gap-4 pb-1">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[13px] font-semibold">{t("what")}</legend>
              {requirement.allowed_actions.map((item) => (
                <label key={item} className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 text-[15px] ${action === item ? "border-j-accent bg-j-accent-soft font-bold" : "border-j-line"}`}>
                  <input type="radio" name="action_choice" value={item} checked={action === item} onChange={() => setAction(item)} className="h-4 w-4 accent-[#2f5bea]" />
                  {t(`actions.${item}`)}
                </label>
              ))}
            </fieldset>
            {needIn && (
              <label className="flex flex-col text-[13px] font-semibold">
                {t("checkIn")}
                <input type="time" name="check_in" required className={field} />
              </label>
            )}
            {needOut && (
              <label className="flex flex-col text-[13px] font-semibold">
                {t("checkOut")}
                <input type="time" name="check_out" required className={field} />
              </label>
            )}
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              {t("evidence")}
              <span className="flex min-h-12 items-center gap-2 rounded-xl border border-dashed border-[#c9d4f2] px-3 text-sm font-normal text-j-muted">
                <Camera aria-hidden className="h-5 w-5 text-j-accent" />
                <span className="truncate">{fileName ?? t("evidenceHint")}</span>
              </span>
              <input type="file" name="file" accept="image/jpeg,image/png,image/webp" capture="environment" required className="sr-only" data-fix-file onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
            </label>
            <label className="flex flex-col text-[13px] font-semibold">
              {t("note")}
              <textarea name="caption" rows={2} maxLength={500} className={field} />
            </label>
            <p className="text-xs text-j-muted">{t("rule")}</p>
            {error && <p role="alert" className="text-sm font-semibold text-[#a8261c]">{error}</p>}
          </form>
        )}
      </BottomSheet>
    </>
  );
}
