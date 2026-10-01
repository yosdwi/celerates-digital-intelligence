"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { uploadTaskEvidence } from "@/app/me/actions";
import { BottomSheet } from "@/components/mobile/primitives";
import { buttonClass } from "@/components/mobile/styles";
import { EvidenceDropzone } from "@/components/talent/evidence-dropzone";

const field = "mt-1 w-full rounded-xl border border-[#d5dbe5] bg-j-surface px-3 py-2.5 text-[15px] font-normal text-j-ink outline-none focus:border-j-accent";
const newNonce = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "");

export function TaskEvidenceButton({ taskKey, title, year, month }: { taskKey: string; title: string; year: number; month: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(newNonce);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (form: HTMLFormElement) => {
    setError(null);
    if (!evidenceFile) return setError("Foto evidence wajib diunggah.");
    const data = new FormData(form);
    data.set("file", evidenceFile, evidenceFile.name || "evidence.jpg");
    data.set("task_key", taskKey);
    data.set("year", String(year));
    data.set("month", String(month));
    data.set("nonce", nonce);
    start(async () => {
      const result = await uploadTaskEvidence(data);
      if (!result.ok) return setError(result.error);
      setDone(result.status === "already_present" ? "Evidence sudah tersedia" : "Evidence tersimpan");
    });
  };

  const close = () => {
    setOpen(false);
    if (done) router.refresh();
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
          setEvidenceFile(null);
        }}
        data-action="task-evidence"
        className={`${buttonClass.secondary} !h-11 !w-auto px-4`}
      >
        <Upload aria-hidden className="h-[18px] w-[18px]" /> Upload evidence
      </button>

      <BottomSheet
        open={open}
        onClose={close}
        title="Evidence Task"
        desktopMode="side"
        footer={
          done ? (
            <button type="button" onClick={close} className={buttonClass.primary}>Selesai</button>
          ) : (
            <button type="submit" form={`task-form-${taskKey}`} disabled={pending} data-action="task-evidence-submit" className={`${buttonClass.primary} disabled:opacity-50`}>
              <Upload aria-hidden className="h-[18px] w-[18px]" /> {pending ? "Menyimpan…" : "Simpan evidence"}
            </button>
          )
        }
      >
        {done ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center" role="status" data-task-evidence-saved>
            <CheckCircle2 aria-hidden className="h-10 w-10 text-j-ok" />
            <p className="text-[15px] font-bold">{done}</p>
            <p className="text-sm text-j-muted">Satu evidence tersimpan untuk task ini.</p>
          </div>
        ) : (
          <form id={`task-form-${taskKey}`} onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} className="flex flex-col gap-4 pb-1">
            <div>
              <p className="text-[15px] font-bold leading-snug">{title}</p>
              <p className="mt-1 text-xs text-j-muted md:text-sm">Lampirkan satu evidence yang mewakili penyelesaian task ini.</p>
            </div>
            <EvidenceDropzone file={evidenceFile} onFileChange={setEvidenceFile} label="Foto evidence" disabled={pending} />
            <label className="flex flex-col text-[13px] font-semibold">
              Keterangan (opsional)
              <textarea name="caption" rows={3} maxLength={500} className={field} />
            </label>
            {error && <p role="alert" className="text-sm font-semibold text-[#a8261c]">{error}</p>}
          </form>
        )}
      </BottomSheet>
    </>
  );
}
