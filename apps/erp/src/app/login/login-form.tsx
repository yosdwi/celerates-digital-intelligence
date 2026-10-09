"use client";
// Sales pilot sign-in: corporate email/password remains the bootstrap and recovery path.
// Registered backoffice users can sign in with a discoverable WebAuthn passkey (Face ID / Touch ID / Windows Hello).
import { useEffect, useState, useTransition } from "react";
import { getSession, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Fingerprint, Mail, Lock, Eye, EyeOff, KeyRound } from "lucide-react";

type Step = "password" | "otp" | "reset-email" | "reset-code";
const ERRORS: Record<string, string> = {
  invalid_credentials: "Email atau password salah",
  invalid_code: "Kode salah atau sudah kedaluwarsa",
  rate_limited: "Terlalu banyak percobaan. Coba lagi dalam 15 menit.",
  mail_unavailable: "Email kode tidak dapat dikirim saat ini. Hubungi admin.",
  mailbox_not_allowed: "Gunakan akun korporat @celerates.com atau @celerates.co.id.",
  weak_password: "Password minimal 8 karakter",
  passkey_failed: "Biometrik/passkey tidak dapat digunakan. Coba lagi atau masuk dengan email.",
};
const input =
  "w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all";
const primary =
  "w-full rounded-xl bg-gradient-to-r from-violet-600 to-pink-500 px-4 py-3 text-sm font-semibold text-white hover:shadow-[0_10px_24px_-6px_rgba(124,58,237,0.55)] active:scale-[0.98] transition-all shadow-[0_8px_20px_-6px_rgba(124,58,237,0.45)] disabled:opacity-60";

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

async function api(body: Record<string, unknown>) {
  const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json().catch(() => ({ error: "unknown" }))) as { next?: string; error?: string };
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("password");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => setPasskeySupported(typeof window !== "undefined" && "PublicKeyCredential" in window && !!navigator.credentials), []);

  const fail = (key?: string) => setError(ERRORS[key ?? ""] ?? "Tidak dapat masuk. Coba lagi.");

  async function finish(pw = password) {
    const result = await signIn("credentials", { email, password: pw, redirect: false });
    if (result?.error) return fail("invalid_credentials");
    window.location.href = "/";
  }

  // The server may have signed this browser in even though the ceremony reported an error here: go in, don't say no.
  async function passkeyFailed() {
    if (await getSession().catch(() => null)) window.location.href = "/";
    else fail("passkey_failed");
  }

  function passkeyLogin() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const optionsRes = await fetch("/api/passkey/login/options", { method: "POST", headers: { "Content-Type": "application/json" } });
        const options = (await optionsRes.json()) as {
          error?: string;
          challengeId?: string;
          publicKey?: { challenge: string; rpId: string; timeout: number; userVerification: UserVerificationRequirement };
        };
        if (!optionsRes.ok || !options.challengeId || !options.publicKey) return fail(options.error === "rate_limited" ? "rate_limited" : "passkey_failed");

        const credential = (await navigator.credentials.get({
          publicKey: {
            ...options.publicKey,
            challenge: toBytes(options.publicKey.challenge),
          },
        })) as PublicKeyCredential | null;
        if (!credential) return passkeyFailed();
        const response = credential.response as AuthenticatorAssertionResponse;
        const result = await signIn("passkey", {
          redirect: false,
          challengeId: options.challengeId,
          credentialId: toB64(credential.rawId),
          clientDataJSON: toB64(response.clientDataJSON),
          authenticatorData: toB64(response.authenticatorData),
          signature: toB64(response.signature),
          userHandle: toB64(response.userHandle),
        });
        if (result?.error) return passkeyFailed();
        window.location.href = "/";
      } catch (e) {
        if ((e as DOMException)?.name !== "NotAllowedError") console.warn("[login] passkey", (e as Error).message);
        await passkeyFailed();
      }
    });
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      if (step === "password") {
        const r = await api({ action: "start", email, password });
        if (r.next === "signin") return finish();
        if (r.next === "otp" || r.error === "mail_unavailable") {
          setCode("");
          setNotice(
            r.next === "otp"
              ? `Kode 6 digit dikirim ke ${email}. Berlaku 10 menit.`
              : "Email kode tidak dapat dikirim saat ini. Jika admin memberi Anda kode pemulihan, masukkan di sini.",
          );
          return setStep("otp");
        }
        return fail(r.error);
      }
      if (step === "otp") {
        const r = await api({ action: "verify", email, code });
        return r.next === "signin" ? finish() : fail(r.error);
      }
      if (step === "reset-email") {
        await api({ action: "reset-start", email });
        setCode("");
        setPassword("");
        setNotice(`Jika ${email} terdaftar, kode 6 digit dikirim ke email tersebut.`);
        return setStep("reset-code");
      }
      const r = await api({ action: "reset-verify", email, code, password });
      return r.next === "signin" ? finish() : fail(r.error);
    });
  }

  const codeField = (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">Kode verifikasi</span>
      <div className="relative">
        <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          pattern="\d{6}"
          className={`${input} tracking-[0.4em]`}
        />
      </div>
    </label>
  );

  return (
    <div className="space-y-5">
      {searchParams.get("expired") === "1" && step === "password" && (
        <p className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-amber-700">Sesi Anda berakhir. Silakan masuk kembali.</p>
      )}
      {notice && step !== "password" && <p className="rounded-xl bg-violet-50 border border-violet-100 px-3 py-2 text-sm text-violet-700">{notice}</p>}

      {step === "password" && passkeySupported && (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={passkeyLogin}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <Fingerprint className="h-5 w-5 text-violet-600" />
            Masuk dengan biometrik / passkey
          </button>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            atau gunakan email perusahaan
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="space-y-4">
        {(step === "password" || step === "reset-email") && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Email perusahaan</span>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input name="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@celerates.com / .co.id" className={input} />
            </div>
          </label>
        )}
        {(step === "otp" || step === "reset-code") && codeField}
        {(step === "password" || step === "reset-code") && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{step === "reset-code" ? "Password baru" : "Password"}</span>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={step === "reset-code" ? 8 : undefined}
                autoComplete={step === "reset-code" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={step === "reset-code" ? "Minimal 8 karakter" : "Masukkan password Anda"}
                className={`${input} pr-11`}
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1} aria-label="Tampilkan password">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
        )}

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        <button type="submit" disabled={isPending} className={primary}>
          {isPending ? "Memproses..." : step === "password" ? "Masuk dengan email" : step === "otp" ? "Verifikasi & masuk" : step === "reset-email" ? "Kirim kode" : "Simpan password & masuk"}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500">
        {step === "password" ? (
          <button type="button" onClick={() => { setError(null); setStep("reset-email"); }} className="text-violet-600 font-medium hover:underline">
            Aktivasi akun / lupa password
          </button>
        ) : (
          <button type="button" onClick={() => { setError(null); setNotice(null); setStep("password"); }} className="text-violet-600 font-medium hover:underline">
            Kembali ke login
          </button>
        )}
      </p>
    </div>
  );
}
