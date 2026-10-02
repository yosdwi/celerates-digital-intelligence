"use client";
// Backoffice sign-in (docs/security/02): password → (new browser only) code from the corporate mailbox → session.
// A trusted browser with a valid session never sees this page; one whose session expired needs only the password.
// "Aktivasi akun / lupa password" uses the same code to set a password (invites have none until then).
import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, KeyRound } from "lucide-react";

type Step = "password" | "otp" | "reset-email" | "reset-code";
const ERRORS: Record<string, string> = {
  invalid_credentials: "Email atau password salah",
  invalid_code: "Kode salah atau sudah kedaluwarsa",
  rate_limited: "Terlalu banyak percobaan. Coba lagi dalam 15 menit.",
  mail_unavailable: "Email kode tidak dapat dikirim saat ini. Hubungi admin.",
  mailbox_not_allowed: "Akun ini harus memakai email korporat @celerates.com. Hubungi admin.",
  weak_password: "Password minimal 8 karakter",
};
const input =
  "w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all";
const primary =
  "w-full rounded-xl bg-gradient-to-r from-violet-600 to-pink-500 px-4 py-3 text-sm font-semibold text-white hover:shadow-[0_10px_24px_-6px_rgba(124,58,237,0.55)] active:scale-[0.98] transition-all shadow-[0_8px_20px_-6px_rgba(124,58,237,0.45)] disabled:opacity-60";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const fail = (key?: string) => setError(ERRORS[key ?? ""] ?? "Tidak dapat masuk. Coba lagi.");

  async function finish(pw = password) {
    const result = await signIn("credentials", { email, password: pw, redirect: false });
    if (result?.error) return fail("invalid_credentials");
    window.location.href = "/";
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
      {searchParams.get("error") === "AccessDenied" && step === "password" && (
        <p className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-amber-700">Sesi Anda berakhir. Silakan masuk kembali.</p>
      )}
      {notice && step !== "password" && <p className="rounded-xl bg-violet-50 border border-violet-100 px-3 py-2 text-sm text-violet-700">{notice}</p>}

      <form onSubmit={submit} className="space-y-4">
        {(step === "password" || step === "reset-email") && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Email</span>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input name="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@celerates.com" className={input} />
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
          {isPending ? "Memproses..." : step === "password" ? "Sign in" : step === "otp" ? "Verifikasi & masuk" : step === "reset-email" ? "Kirim kode" : "Simpan password & masuk"}
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
