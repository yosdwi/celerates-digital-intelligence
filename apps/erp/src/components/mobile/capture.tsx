"use client";
// Tangkap dokumen (doc 18 §17): photograph or pick a document on the phone, then choose where it goes — a governed
// Company File (kind, class and owning division chosen explicitly, ADR-018) or the Agent conversation as working
// context. Nothing is filed without that choice; the Agent never decides the class.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, CheckCircle2, FileUp, FolderInput, Sparkles } from "lucide-react";
import { ClassFields, useKinds } from "@/components/files/class-fields";
import { openAgent } from "./events";
import { BottomSheet } from "./primitives";
import { buttonClass } from "./styles";

const ACCEPT = ".pdf,.docx,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg";
const MAX = 20 * 1024 * 1024;
const fieldClass = "mt-1 w-full rounded-xl border border-[#d5dbe5] bg-j-surface px-3 py-2.5 text-[0.9375rem] font-normal text-j-ink outline-none focus:border-j-accent";
const labelClass = "flex flex-col text-[0.8125rem] font-semibold text-j-ink";

export function CaptureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("mobile.capture");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dest, setDest] = useState<"files" | "agent">("files");
  const [saved, setSaved] = useState<{ id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const kinds = useKinds();

  useEffect(() => {
    if (!open) {
      setFile(null);
      setSaved(null);
      setError(null);
      setDest("files");
    }
  }, [open]);
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const choose = (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    setError(f.size > MAX ? t("tooLarge") : null);
    setFile(f.size > MAX ? null : f);
    setSaved(null);
  };
  const save = async () => {
    if (!file || !form.current) return;
    setPending(true);
    setError(null);
    try {
      const body = new FormData(form.current);
      body.set("file", file, file.name);
      const response = await fetch("/api/files", { method: "POST", body });
      const out = await response.json().catch(() => ({}));
      if (!response.ok || !out.id) throw new Error(out.error ?? t("failed"));
      setSaved({ id: out.id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  const toAgent = () => {
    if (!file) return;
    const f = file;
    onClose();
    openAgent({ file: f });
  };

  const footer = saved ? (
    <>
      <button type="button" onClick={onClose} className={buttonClass.secondary}>
        {t("done")}
      </button>
      <a href={`/api/files/${saved.id}/content?preview=1`} target="_blank" rel="noopener" className={buttonClass.primary}>
        {t("open")}
      </a>
    </>
  ) : file ? (
    dest === "files" ? (
      <button type="button" onClick={save} disabled={pending || !kinds} data-action="capture-save" className={`${buttonClass.primary} disabled:opacity-50`}>
        <FolderInput aria-hidden className="h-[18px] w-[18px]" />
        {pending ? t("saving") : t("save")}
      </button>
    ) : (
      <button type="button" onClick={toAgent} data-action="capture-agent" className={buttonClass.primary}>
        <Sparkles aria-hidden className="h-[18px] w-[18px]" />
        {t("sendToAgent")}
      </button>
    )
  ) : undefined;

  return (
    <BottomSheet open={open} onClose={onClose} title={t("title")} footer={footer}>
      <div className="flex flex-col gap-4 pb-1" data-capture-sheet>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => choose(e.target.files)} data-capture-camera />
        <input ref={picker} type="file" accept={ACCEPT} className="hidden" onChange={(e) => choose(e.target.files)} data-capture-file />

        {saved ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center" role="status" data-capture-saved={saved.id}>
            <CheckCircle2 aria-hidden className="h-10 w-10 text-j-ok" />
            <p className="text-[0.9375rem] font-bold">{t("savedTitle")}</p>
            <p className="text-sm text-j-muted">{t("savedBody")}</p>
            <Link href={`/files?file=${saved.id}`} className="text-[0.8125rem] font-semibold text-j-accent">
              {t("openInFiles")}
            </Link>
          </div>
        ) : !file ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => camera.current?.click()} className="flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-j-card border border-j-line bg-j-surface p-3 text-sm font-bold shadow-j-card">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-j-accent-soft text-j-accent">
                  <Camera aria-hidden className="h-6 w-6" strokeWidth={1.9} />
                </span>
                {t("takePhoto")}
              </button>
              <button type="button" onClick={() => picker.current?.click()} className="flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-j-card border border-j-line bg-j-surface p-3 text-sm font-bold shadow-j-card">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eef1f5] text-[#3f4a5c]">
                  <FileUp aria-hidden className="h-6 w-6" strokeWidth={1.9} />
                </span>
                {t("pickFile")}
              </button>
            </div>
            <p className="text-xs text-j-muted">{t("hint")}</p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-2xl border border-j-line bg-j-surface p-3" data-capture-picked>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-14 w-14 shrink-0 rounded-[10px] object-cover" />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] bg-[#fdebe8] text-[#b3261e]">
                  <FileUp aria-hidden className="h-6 w-6" />
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{file.name}</span>
                <span className="text-xs text-j-muted">{file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</span>
              </span>
              <button type="button" onClick={() => setFile(null)} className="h-11 shrink-0 px-2 text-[0.8125rem] font-bold text-j-accent">
                {t("change")}
              </button>
            </div>

            <div role="radiogroup" aria-label={t("destination")} className="grid grid-cols-2 gap-1 rounded-2xl bg-j-field p-1">
              {(["files", "agent"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={dest === d}
                  onClick={() => setDest(d)}
                  data-capture-dest={d}
                  className={`h-11 rounded-xl text-[0.8125rem] font-bold ${dest === d ? "bg-j-surface text-j-ink shadow-j-card" : "text-j-muted"}`}
                >
                  {t(`dest.${d}`)}
                </button>
              ))}
            </div>

            {dest === "files" ? (
              <form ref={form} onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex flex-col gap-3">
                <label className={labelClass}>
                  {t("fileTitle")}
                  <input name="title" maxLength={200} placeholder={t("fileTitlePlaceholder")} className={fieldClass} />
                </label>
                {kinds ? <ClassFields kinds={kinds} labelClass={labelClass} fieldClass={fieldClass} /> : <p className="text-sm text-j-muted">{t("loadingKinds")}</p>}
                <p className="text-xs text-j-muted">{t("filesNote")}</p>
              </form>
            ) : (
              <p className="text-sm text-j-muted">{t("agentNote")}</p>
            )}
          </>
        )}
        {error && <p role="alert" className="text-sm font-semibold text-[#a8261c]">{error}</p>}
      </div>
    </BottomSheet>
  );
}
