"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Camera, CheckCircle2, LogOut, Save } from "lucide-react";
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

export function CorrectionSheet({
  requirement,
  trigger,
  triggerClassName,
  triggerAriaLabel,
}: {
  requirement: Requirement;
  trigger?: ReactNode;
  triggerClassName?: string;
  triggerAriaLabel?: string;
}) {
  const t = useTranslations("talent.fix");
  const talentT = useTranslations("talent");
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
  const formId = `talent-fix-${requirement.work_date}`;
  const dateLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${requirement.work_date}T00:00:00Z`));
  const actionLabel = (item: string) => (item === "worked" ? "Bekerja" : t(`actions.${item}`));

  const close = () => {
    setOpen(false);
    if (done) router.refresh();
  };
  const submit = (form: HTMLFormElement) => {
    setError(null);
    const data = new FormData(form);
    data.set("work_date", requirement.work_date);
    data.set("action", action);
    data.set("nonce", nonce);
    start(async () => {
      const result = await submitAttendanceCorrection(data);
      if (!result.ok) return setError(result.error);
      setDone(result.status === "already_open" ? "Attendance sudah tersimpan" : "Attendance tersimpan");
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setNonce(newNonce());
          setDone(null);
          setError(null);
          setFileName(null);
          setAction(requirement.allowed_actions[0] ?? "worked");
        }}
        data-action="talent-fix"
        aria-label={triggerAriaLabel}
        className={triggerClassName ?? buttonClass.primary}
      >
        {trigger ?? t("open")}
      </button>
      <BottomSheet
        open={open}
        onClose={close}
        title="Lengkapi Kehadiran"
        footer={
          done ? (
            <button type="button" onClick={close} className={buttonClass.primary}>
              Selesai
            </button>
          ) : (
            <button type="submit" form={formId} disabled={pending} data-action="talent-fix-submit" className={`${buttonClass.primary} disabled:opacity-50`}>
              <Save aria-hidden className="h-[18px] w-[18px]" /> {pending ? "Menyimpan…" : "Simpan"}
            </button>
          )
        }
      >
        {done ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center" role="status" data-fix-done>
            <CheckCircle2 aria-hidden className="h-10 w-10 text-j-ok" />
            <p className="text-[15px] font-bold">{done}</p>
            <p className="text-sm text-j-muted">Perubahan attendance berhasil dikirim.</p>
          </div>
        ) : (
          <form id={formId} onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} className="flex flex-col gap-4 pb-1">
            <div className="flex flex-col gap-0.5">
              <p className="text-[15px] font-bold capitalize">{dateLabel}</p>
              <p className="text-sm text-j-muted">{talentT(`gap.${requirement.gap}`)}</p>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[13px] font-semibold">Status</legend>
              <div className="flex flex-wrap gap-2">
                {requirement.allowed_actions.map((item) => (
                  <label
                    key={item}
                    className={`flex min-h-10 cursor-pointer items-center rounded-full border px-4 text-[14px] transition ${action === item ? "border-j-accent bg-j-accent text-white font-bold" : "border-j-line bg-j-surface text-j-ink"}`}
                  >
                    <input type="radio" name="action_choice" value={item} checked={action === item} onChange={() => setAction(item)} className="sr-only" />
                    {actionLabel(item)}
                  </label>
                ))}
              </div>
            </fieldset>

            {worked && (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex min-w-0 flex-col text-[13px] font-semibold">
                  {t("checkIn")}
                  {needIn ? (
                    <input type="time" name="check_in" required className={field} />
                  ) : (
                    <span className="mt-1 flex min-h-11 items-center rounded-xl bg-[#f4f6f9] px-3 text-[15px] font-semibold text-j-muted">{requirement.raw_check_in ?? "—"}</span>
                  )}
                </label>
                <label className="flex min-w-0 flex-col text-[13px] font-semibold">
                  {t("checkOut")}
                  {needOut ? (
                    <input type="time" name="check_out" required className={field} />
                  ) : (
                    <span className="mt-1 flex min-h-11 items-center rounded-xl bg-[#f4f6f9] px-3 text-[15px] font-semibold text-j-muted">{requirement.raw_check_out ?? "—"}</span>
                  )}
                </label>
              </div>
            )}

            <label className="flex cursor-pointer flex-col gap-1 text-[13px] font-semibold">
              Bukti pendukung
              <span className="flex min-h-12 items-center gap-2 rounded-xl border border-dashed border-[#c9d4f2] px-3 text-sm font-normal text-j-muted">
                <Camera aria-hidden className="h-5 w-5 text-j-accent" />
                <span className="truncate">{fileName ?? "Tambah foto evidence"}</span>
              </span>
              <input type="file" name="file" accept="image/jpeg,image/png,image/webp" capture="environment" required className="sr-only" data-fix-file onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
            </label>

            <label className="flex flex-col text-[13px] font-semibold">
              {t("note")}
              <textarea name="caption" rows={2} maxLength={500} className={field} />
            </label>
            {error && <p role="alert" className="text-sm font-semibold text-[#a8261c]">{error}</p>}
          </form>
        )}
      </BottomSheet>
    </>
  );
}
