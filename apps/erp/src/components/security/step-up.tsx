"use client";
// "Confirm it's you" (docs/security/02). `ensure()` resolves true once the session holds a fresh step-up: it emails a
// code to the user's own mailbox and verifies it. One confirmation covers a 10-minute task window, not one click.
import { useCallback, useRef, useState } from "react";

type State = { phase: "closed" } | { phase: "sending" } | { phase: "code"; email: string; error?: string } | { phase: "error"; message: string };

const MESSAGES: Record<string, string> = {
  mail_unavailable: "Email kode tidak dapat dikirim saat ini. Hubungi admin.",
  mailbox_not_allowed: "Akun ini belum memakai mailbox korporat untuk verifikasi. Hubungi admin.",
  rate_limited: "Terlalu banyak permintaan. Coba lagi dalam 15 menit.",
};

export function useStepUp() {
  const [state, setState] = useState<State>({ phase: "closed" });
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const close = (ok: boolean) => {
    setState({ phase: "closed" });
    setCode("");
    resolver.current?.(ok);
    resolver.current = null;
  };

  const send = useCallback(async () => {
    setState({ phase: "sending" });
    const res = await fetch("/api/step-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send" }) });
    const body = await res.json().catch(() => ({}));
    setState(res.ok ? { phase: "code", email: body.email ?? "" } : { phase: "error", message: MESSAGES[body.error] ?? "Verifikasi tidak tersedia." });
  }, []);

  const ensure = useCallback(() => {
    void send();
    return new Promise<boolean>((resolve) => (resolver.current = resolve));
  }, [send]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/step-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", code }) });
    setBusy(false);
    if (res.ok) return close(true);
    setCode("");
    setState((s) => (s.phase === "code" ? { ...s, error: "Kode salah atau sudah kedaluwarsa." } : s));
  }

  const dialog =
    state.phase === "closed" ? null : (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="step-up-title">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
          <h2 id="step-up-title" className="text-base font-semibold text-slate-900">Konfirmasi ini Anda</h2>
          {state.phase === "sending" && <p className="mt-2 text-sm text-slate-500">Mengirim kode…</p>}
          {state.phase === "error" && <p className="mt-2 text-sm text-red-600">{state.message}</p>}
          {state.phase === "code" && (
            <form onSubmit={verify} className="mt-2 space-y-3">
              <p className="text-sm text-slate-600">Kode 6 digit dikirim ke {state.email}. Berlaku 10 menit.</p>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                aria-label="Kode verifikasi"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-lg tracking-[0.4em]"
              />
              {state.error && <p className="text-sm text-red-600">{state.error}</p>}
              <button type="submit" disabled={busy || code.length !== 6} className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {busy ? "Memeriksa…" : "Konfirmasi"}
              </button>
              <button type="button" onClick={() => void send()} className="w-full text-xs text-slate-500 hover:underline">
                Kirim ulang kode
              </button>
            </form>
          )}
          <button type="button" onClick={() => close(false)} className="mt-3 w-full text-sm text-slate-500 hover:underline">
            Batal
          </button>
        </div>
      </div>
    );

  return { ensure, dialog };
}
