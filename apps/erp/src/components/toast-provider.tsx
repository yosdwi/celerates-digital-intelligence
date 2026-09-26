"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

type ToastKind = "success" | "error";
type ToastItem = { id: number; message: string; kind: ToastKind; leaving: boolean };

const ToastContext = createContext<{ showToast: (message: string, kind?: ToastKind) => void } | null>(null);

/**
 * Dipanggil dari mana saja (AddRecordModal, SaveForm, atau custom action
 * lain) buat nampilin notifikasi sukses/gagal yang konsisten di seluruh app --
 * daripada tiap modul bikin ulang popup-nya sendiri-sendiri.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast harus dipakai di dalam ToastProvider");
  return ctx;
}

const AUTO_DISMISS_MS = 3200;
const LEAVE_ANIMATION_MS = 200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), LEAVE_ANIMATION_MS);
  }, []);

  const showToast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, kind, leaving: false }]);
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col items-end gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{ animation: `${t.leaving ? "toast-out" : "toast-in"} ${LEAVE_ANIMATION_MS}ms ease-out forwards` }}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 pr-3 shadow-lg ring-1 text-sm font-medium max-w-sm ${
              t.kind === "success"
                ? "bg-emerald-600 text-white ring-emerald-700/50"
                : "bg-red-600 text-white ring-red-700/50"
            }`}
          >
            {t.kind === "success" ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <XCircle className="h-5 w-5 shrink-0" />}
            <span className="leading-snug">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="ml-1 shrink-0 rounded p-0.5 text-white/70 hover:text-white hover:bg-white/10">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
