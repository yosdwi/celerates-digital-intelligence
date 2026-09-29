"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { SignaturePad } from "@/components/signature-pad";
import { saveSignature } from "./actions";

export function SignatureSection({ currentSignatureUrl }: { currentSignatureUrl: string | null }) {
  const t = useTranslations("ttd");
  const tc = useTranslations("common");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(!currentSignatureUrl);
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave(file: File) {
    setError(null);
    setIsSaving(true);
    try {
      const result = await saveSignature(file);
      if (!result.ok) { setError(result.error); return; }
      setEditing(false);
      setUploadFile(null);
    } finally {
      setIsSaving(false);
    }
  }

  function handleUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Cuma simpan pilihan file dulu -- baru benar-benar diupload saat tombol
    // "Simpan Tanda Tangan" ditekan, supaya ada langkah konfirmasi yang jelas
    // (dan indikator loading) alih-alih auto-upload diam-diam saat memilih file.
    setError(null);
    setUploadFile(e.target.files?.[0] ?? null);
  }

  return (
    <div>
      {currentSignatureUrl && !editing && (
        <div className="space-y-2">
          <div className="inline-block rounded-lg border border-slate-200 p-3 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentSignatureUrl} alt={t("mySignatureAlt")} className="h-24 object-contain" />
          </div>
          <div>
            <button onClick={() => setEditing(true)} className="text-xs font-medium text-brand-600 hover:underline">
              {t("redrawOrUpload")}
            </button>
          </div>
        </div>
      )}
      {editing && (
        <>
          <div className="flex gap-1.5 mb-3">
            <button
              type="button"
              onClick={() => setMode("draw")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${mode === "draw" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {t("drawSignature")}
            </button>
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${mode === "upload" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {t("uploadFromImage")}
            </button>
          </div>

          {mode === "draw" ? (
            <SignaturePad onSave={handleSave} />
          ) : (
            <div>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">{t("chooseSignatureFile")}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadChange}
                  disabled={isSaving}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs disabled:opacity-60"
                />
              </label>
              {uploadFile && (
                <button
                  type="button"
                  onClick={() => handleSave(uploadFile)}
                  disabled={isSaving}
                  className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60 disabled:cursor-wait"
                >
                  {isSaving ? t("savingSignature") : t("saveSignature")}
                </button>
              )}
            </div>
          )}

          {currentSignatureUrl && (
            <button onClick={() => setEditing(false)} className="mt-2 text-xs text-slate-500 hover:underline">{tc("cancel")}</button>
          )}
        </>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
