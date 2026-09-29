"use client";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "./toast-provider";

export function AddRecordModal({
  buttonLabel,
  title,
  action,
  children,
  defaultOpen,
  open: controlledOpen,
  onOpenChange,
}: {
  buttonLabel: string;
  title: string;
  action: (formData: FormData) => Promise<void> | void;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** Opsional -- kalau dikirim (bareng onOpenChange), modal jadi controlled dari luar
   *  (dipakai buat memastikan cuma satu modal yang terbuka di satu halaman, mis. Account 360).
   *  Tanpa dua prop ini, perilakunya persis sama seperti sebelumnya (internal state). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  function setOpen(next: boolean) {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  }
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const t = useTranslations("common");
  // Portal ke document.body -- kalau tombolnya dirender di dalam kartu ber-backdrop-blur
  // (glass card), backdrop-filter ancestor itu bikin containing block baru buat `fixed`,
  // jadi overlay-nya cuma nutup area kartu itu doang, bukan seluruh layar. Mount-check
  // ini juga jaga-jaga hydration mismatch kalau defaultOpen=true.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await action(fd);
        setOpen(false);
        showToast(t("savedSuccess"));
      } catch (err: any) {
        showToast(err?.message || t("saveFailed"), "error");
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_-6px_rgba(25,70,103,0.55)] hover:shadow-[0_10px_24px_-6px_rgba(25,70,103,0.65)] hover:-translate-y-0.5 active:scale-95 transition-all duration-200"
      >
        <Plus className="h-4 w-4" />
        {buttonLabel}
      </button>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-center justify-center p-4 [animation:overlay-in_0.2s_ease]"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white/85 backdrop-blur-2xl border border-white/70 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.05),0_40px_70px_-20px_rgba(9,20,35,0.45)] w-full max-w-3xl max-h-[85vh] overflow-y-auto [animation:modal-in_0.28s_cubic-bezier(0.2,0.9,0.25,1)]"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white/85 backdrop-blur-2xl z-10">
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {children}
              </div>
              <div className="sm:col-span-3 pt-4 mt-2 border-t border-slate-100 flex gap-3">
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_-6px_rgba(25,70,103,0.55)] hover:shadow-[0_10px_24px_-6px_rgba(25,70,103,0.65)] active:scale-95 disabled:opacity-50 transition-all duration-200"
                >
                  {isPending ? t("saving") : t("save")}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  {t("cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}