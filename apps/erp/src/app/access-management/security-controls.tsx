"use client";
// Per-user security controls for Owners (docs/security/02, 03): deactivate / reactivate, sign out everywhere, and
// sensitivity capabilities. The server re-checks Owner, step-up and input on every call; this is only the UI.
import { useState, useTransition } from "react";
import { useStepUp } from "@/components/security/step-up";
import { deactivateUser, grantCapability, reactivateUser, revokeCapability, signOutUserEverywhere } from "./actions";

export type GrantRow = { id: string; capability: string; scope: string; reason: string; granted_at: string };
const CAPABILITIES = ["identity.read", "identity.reveal", "identity_document.read", "bank.read", "bank.write", "compensation.read", "compensation.write", "payroll.export", "access.admin"];

export function SecurityControls({ userId, status, isTalent, grants }: { userId: string; status: string; isTalent: boolean; grants: GrantRow[] }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const { ensure, dialog } = useStepUp();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      setMessage(null);
      let result = await fn();
      if (!result.ok && result.error === "step_up_required" && (await ensure())) result = await fn();
      setMessage(result.ok ? done : result.error === "step_up_required" ? "Konfirmasi dibatalkan." : result.error ?? "Gagal.");
    });

  function grant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(() => grantCapability(userId, String(f.get("capability")), String(f.get("scope")), String(f.get("reason") ?? "")), "Capability diberikan.");
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        {status === "inactive" ? (
          <button type="button" disabled={pending} onClick={() => run(() => reactivateUser(userId), "Akun diaktifkan kembali.")} className="font-medium text-emerald-700 hover:underline disabled:opacity-50">
            Aktifkan kembali
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => confirm("Nonaktifkan akun ini? Semua sesi langsung berakhir.") && run(() => deactivateUser(userId), "Akun dinonaktifkan; semua sesi berakhir.")}
            className="font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            Nonaktifkan
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => run(() => signOutUserEverywhere(userId), "Semua sesi pengguna ini diakhiri.")} className="font-medium text-slate-700 hover:underline disabled:opacity-50">
          Keluarkan dari semua perangkat
        </button>
      </div>
      {!isTalent && (
        <div>
          <p className="font-semibold text-slate-700">Izin data sensitif</p>
          {grants.length === 0 && <p className="text-slate-500">Tidak ada.</p>}
          <ul className="mt-1 space-y-1">
            {grants.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-white px-1">{g.capability}</code>
                <span className="text-slate-500">{g.scope} · {g.reason}</span>
                <button type="button" disabled={pending} onClick={() => run(() => revokeCapability(g.id), "Capability dicabut.")} className="text-red-600 hover:underline disabled:opacity-50">
                  Cabut
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={grant} className="mt-2 flex flex-wrap items-center gap-2">
            <select name="capability" aria-label="Capability" className="rounded border border-slate-300 px-1 py-1">
              {CAPABILITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select name="scope" aria-label="Cakupan" className="rounded border border-slate-300 px-1 py-1">
              <option value="all">semua tahap</option>
              <option value="onboarding">onboarding</option>
              <option value="employee">karyawan</option>
            </select>
            <input name="reason" required minLength={3} maxLength={300} placeholder="Alasan" aria-label="Alasan" className="flex-1 rounded border border-slate-300 px-2 py-1" />
            <button type="submit" disabled={pending} className="rounded bg-slate-800 px-2 py-1 font-medium text-white disabled:opacity-50">Beri</button>
          </form>
        </div>
      )}
      {message && <p className="text-slate-600" role="status">{message}</p>}
      {dialog}
    </div>
  );
}
