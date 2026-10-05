"use client";
// Users register/revoke their own passkeys here. The biometric itself never leaves the device.
import { useEffect, useState, useTransition } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { revokeMyPasskey } from "@/lib/security/actions";

type Passkey = { id: string; label: string | null; created_at: string; last_used_at: string | null };
type CreateResponse = AuthenticatorAttestationResponse & {
  getTransports?: () => string[];
};

const toBytes = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const toB64 = (value: ArrayBuffer | null) => {
  if (!value) return "";
  const bytes = new Uint8Array(value);
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};
const when = (iso: string) => new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

export function PasskeysPanel({ passkeys }: { passkeys: Passkey[] }) {
  const [supported, setSupported] = useState(false);
  const [pending, start] = useTransition();
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => setSupported(typeof window !== "undefined" && "PublicKeyCredential" in window && !!navigator.credentials), []);

  function register() {
    setMessage(null);
    start(async () => {
      try {
        if (!password) return setMessage({ ok: false, text: "Masukkan password saat ini untuk mengonfirmasi pendaftaran passkey." });
        const optionRes = await fetch("/api/passkey/register", { cache: "no-store" });
        const option = (await optionRes.json()) as {
          error?: string;
          challengeId?: string;
          publicKey?: {
            challenge: string;
            rp: PublicKeyCredentialRpEntity;
            user: { id: string; name: string; displayName: string };
            pubKeyCredParams: PublicKeyCredentialParameters[];
            timeout: number;
            attestation: AttestationConveyancePreference;
            authenticatorSelection: AuthenticatorSelectionCriteria;
            excludeCredentials: { type: "public-key"; id: string; transports?: string[] }[];
          };
        };
        if (!optionRes.ok || !option.challengeId || !option.publicKey) throw new Error(option.error || "options_failed");

        const credential = (await navigator.credentials.create({
          publicKey: {
            ...option.publicKey,
            challenge: toBytes(option.publicKey.challenge),
            user: { ...option.publicKey.user, id: toBytes(option.publicKey.user.id) },
            excludeCredentials: option.publicKey.excludeCredentials.map((c) => ({
              type: "public-key",
              id: toBytes(c.id),
              transports: (c.transports ?? []) as AuthenticatorTransport[],
            })),
          },
        })) as PublicKeyCredential | null;
        if (!credential) throw new Error("credential_cancelled");
        const response = credential.response as CreateResponse;

        const save = await fetch("/api/passkey/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentPassword: password,
            challengeId: option.challengeId,
            credentialId: toB64(credential.rawId),
            clientDataJSON: toB64(response.clientDataJSON),
            attestationObject: toB64(response.attestationObject),
            transports: response.getTransports?.() ?? [],
            label: label || "Perangkat pribadi",
          }),
        });
        const result = (await save.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!save.ok || !result.ok) {
          if (result.error === "invalid_password") return setMessage({ ok: false, text: "Password saat ini salah." });
          if (result.error === "rate_limited") return setMessage({ ok: false, text: "Terlalu banyak percobaan. Coba lagi nanti." });
          throw new Error(result.error || "save_failed");
        }
        setPassword("");
        setMessage({ ok: true, text: "Biometrik/passkey berhasil didaftarkan." });
        window.location.reload();
      } catch (e) {
        if ((e as DOMException)?.name !== "NotAllowedError") console.warn("[profile] passkey register", (e as Error).message);
        setMessage({ ok: false, text: "Passkey tidak dapat didaftarkan di perangkat/browser ini." });
      }
    });
  }

  return (
    <section className="mt-8 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-violet-50 p-2 text-violet-600"><Fingerprint className="h-5 w-5" /></span>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Biometrik / Passkey</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Gunakan Face ID, Touch ID, Windows Hello, atau kunci perangkat. Celerates tidak menyimpan data biometrik; hanya public key perangkat.
          </p>
        </div>
      </div>

      {supported ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Nama perangkat (opsional)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="Password saat ini" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="button" disabled={pending} onClick={register} className="sm:col-span-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {pending ? "Memproses..." : "Daftarkan biometrik / passkey"}
          </button>
        </div>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Browser/perangkat ini belum menyediakan WebAuthn/passkey. Login email tetap tersedia.</p>
      )}

      {message && <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>}

      {passkeys.length > 0 && (
        <ul className="divide-y divide-slate-100 text-sm">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-3">
              <span>
                <span className="font-medium text-slate-800">{p.label || "Passkey"}</span>
                <span className="block text-xs text-slate-500">
                  dibuat {when(p.created_at)}{p.last_used_at ? ` · terakhir dipakai ${when(p.last_used_at)}` : ""}
                </span>
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => confirm("Hapus passkey ini?") && start(async () => { await revokeMyPasskey(p.id); window.location.reload(); })}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Hapus
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
