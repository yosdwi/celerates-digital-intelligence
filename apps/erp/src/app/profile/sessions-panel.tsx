"use client";
// Active sessions and trusted browsers (docs/security/02): users see where they are signed in and end any of it.
import { useTransition } from "react";
import { signOut } from "next-auth/react";
import { logoutAllDevices, revokeMySession, revokeMyTrustedBrowser } from "@/lib/security/actions";

type Session = { id: string; auth_method: string; created_at: string; last_seen_at: string; device: string | null; ip_prefix: string | null };
type Browser = { id: string; device: string | null; created_at: string; expires_at: string };
const when = (iso: string) => new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
const METHOD: Record<string, string> = { password: "Password", "password+email_otp": "Password + kode email", passkey: "Biometrik / Passkey", talent_link: "Tautan WhatsApp" };

export function SessionsPanel({ sessions, browsers, currentSid }: { sessions: Session[]; browsers: Browser[]; currentSid: string | null }) {
  const [pending, start] = useTransition();
  return (
    <section className="mt-8 space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-700">Sesi aktif</h2>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className="font-medium text-slate-800">{s.device ?? "Perangkat"}</span>
                {s.id === currentSid && <span className="ml-2 rounded bg-emerald-100 px-1.5 text-xs text-emerald-700">perangkat ini</span>}
                <span className="block text-xs text-slate-500">
                  {METHOD[s.auth_method] ?? s.auth_method} · masuk {when(s.created_at)} · terakhir aktif {when(s.last_seen_at)}{s.ip_prefix ? ` · ${s.ip_prefix}` : ""}
                </span>
              </span>
              {s.id !== currentSid && (
                <button type="button" disabled={pending} onClick={() => start(() => revokeMySession(s.id))} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
                  Keluarkan
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      {browsers.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Browser tepercaya</h2>
          <p className="text-xs text-slate-500">Browser ini tidak meminta kode email saat masuk sampai masa berlakunya habis.</p>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {browsers.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-medium text-slate-800">{b.device ?? "Browser"}</span>
                  <span className="block text-xs text-slate-500">dipercaya sejak {when(b.created_at)} · berlaku sampai {when(b.expires_at)}</span>
                </span>
                <button type="button" disabled={pending} onClick={() => start(() => revokeMyTrustedBrowser(b.id))} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
                  Lupakan
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => confirm("Keluar dari semua perangkat, termasuk yang ini?") && start(async () => { await logoutAllDevices(); await signOut({ callbackUrl: "/login" }); })}
        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        Keluar dari semua perangkat
      </button>
    </section>
  );
}
