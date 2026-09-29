"use client";
// Task evidence (doc 22 R5.2): add a photo to a task (staged in ConForm), then "Ajukan" submits all staged evidence.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Camera, CheckCircle2, Send, Upload } from "lucide-react";
import { submitTaskEvidence, uploadTaskEvidence } from "@/app/me/actions";
import { BottomSheet } from "@/components/mobile/primitives";
import { buttonClass } from "@/components/mobile/styles";

const field = "mt-1 w-full rounded-xl border border-[#d5dbe5] bg-j-surface px-3 py-2.5 text-[15px] font-normal text-j-ink outline-none focus:border-j-accent";
const newNonce = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "");

export function TaskEvidenceButton({ taskKey, title, year, month, staged }: { taskKey: string; title: string; year: number; month: number; staged: number }) {
  const t = useTranslations("talent.tasks");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(newNonce);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (form: HTMLFormElement) => {
    setError(null);
    const data = new FormData(form);
    data.set("task_key", taskKey);
    data.set("year", String(year));
    data.set("month", String(month));
    data.set("nonce", nonce);
    start(async () => {
      const result = await uploadTaskEvidence(data);
      if (!result.ok) return setError(result.error);
      setDone(result.status === "already_present" ? t("alreadyPresent") : t("stagedDone"));
    });
  };
  const close = () => {
    setOpen(false);
    if (done) router.refresh();
  };
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setNonce(newNonce()); setDone(null); setFileName(null); }} data-action="task-evidence" className={`${buttonClass.secondary} !h-11`}>
        <Upload aria-hidden className="h-[18px] w-[18px]" /> {staged > 0 ? t("addMore", { count: staged }) : t("add")}
      </button>
      <BottomSheet
        open={open}
        onClose={close}
        title={t("sheetTitle")}
        footer={
          done ? (
            <button type="button" onClick={close} className={buttonClass.primary}>{t("close")}</button>
          ) : (
            <button type="submit" form={`task-form-${taskKey}`} disabled={pending} data-action="task-evidence-submit" className={`${buttonClass.primary} disabled:opacity-50`}>
              <Upload aria-hidden className="h-[18px] w-[18px]" /> {pending ? t("sending") : t("save")}
            </button>
          )
        }
      >
        {done ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center" role="status" data-task-staged>
            <CheckCircle2 aria-hidden className="h-10 w-10 text-j-ok" />
            <p className="text-[15px] font-bold">{done}</p>
            <p className="text-sm text-j-muted">{t("stagedBody")}</p>
          </div>
        ) : (
          <form id={`task-form-${taskKey}`} onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} className="flex flex-col gap-4 pb-1">
            <p className="text-sm font-semibold">{title}</p>
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              {t("evidence")}
              <span className="flex min-h-12 items-center gap-2 rounded-xl border border-dashed border-[#c9d4f2] px-3 text-sm font-normal text-j-muted">
                <Camera aria-hidden className="h-5 w-5 text-j-accent" />
                <span className="truncate">{fileName ?? t("evidenceHint")}</span>
              </span>
              <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required className="sr-only" data-task-file onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
            </label>
            <label className="flex flex-col text-[13px] font-semibold">
              {t("caption")}
              <textarea name="caption" rows={2} maxLength={500} className={field} />
            </label>
            {error && <p role="alert" className="text-sm font-semibold text-[#a8261c]">{error}</p>}
          </form>
        )}
      </BottomSheet>
    </>
  );
}

export function TaskSubmitBar({ year, month, staged }: { year: number; month: number; staged: number }) {
  const t = useTranslations("talent.tasks");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-j-line bg-j-surface/95 px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <div className="mx-auto flex max-w-xl flex-col gap-2">
        {error && <p role="alert" className="text-sm font-semibold text-[#a8261c]">{error}</p>}
        {message && <p role="status" className="text-sm font-semibold text-j-ok" data-task-submitted>{message}</p>}
        <button
          type="button"
          disabled={pending}
          data-action="task-submit"
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await submitTaskEvidence(year, month, newNonce());
              if (!result.ok) return setError(result.error);
              setMessage(t("submitted", { count: result.count }));
              router.refresh();
            })
          }
          className={`${buttonClass.primary} disabled:opacity-50`}
        >
          <Send aria-hidden className="h-[18px] w-[18px]" /> {pending ? t("sending") : t("submit", { count: staged })}
        </button>
      </div>
    </div>
  );
}
