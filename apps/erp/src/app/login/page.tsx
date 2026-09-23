import Image from "next/image";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 overflow-hidden bg-slate-950 relative">
      {/* Blob gradient warna-warni di background gelap -- mengikuti arah desain "colorful modern SaaS" */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-violet-600/40 blur-[110px]" />
      <div className="absolute -bottom-40 -right-32 w-[520px] h-[520px] rounded-full bg-pink-600/35 blur-[110px]" />
      <div className="absolute top-1/4 right-1/3 w-72 h-72 rounded-full bg-blue-500/30 blur-[100px]" />
      <div className="absolute bottom-1/4 left-1/3 w-64 h-64 rounded-full bg-emerald-500/20 blur-[100px]" />

      <div className="relative z-10 w-full h-[90vh] max-w-[1400px] rounded-3xl shadow-[0_20px_80px_-20px_rgba(124,58,237,0.45)] overflow-hidden grid md:grid-cols-[1.05fr_1fr] border border-white/10">
        {/* Panel kiri -- branding gelap + preview dashboard mengambang */}
        <div className="hidden md:flex flex-col justify-between relative overflow-hidden p-10 bg-gradient-to-br from-brand-900 via-brand-800 to-violet-950">
          <div className="absolute -top-24 -right-16 w-80 h-80 rounded-full bg-violet-500/25 blur-[90px]" />
          <div className="absolute bottom-10 -left-10 w-64 h-64 rounded-full bg-pink-500/20 blur-[90px]" />

          <div className="relative z-10">
            <div className="flex items-center gap-2.5 mb-10">
              <Image src="/logo-celerates.jpg" alt="Celerates" width={34} height={34} className="rounded-lg" />
              <span className="text-base font-semibold text-white">Celerates ERP</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200/80">
              Terhubung, Sederhana, Terpercaya
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mt-3 leading-tight max-w-md">
              Satu Platform untuk Seluruh Proses Talent
            </h2>
          </div>

          {/* Preview dashboard mengambang -- kartu terang di atas panel gelap, mirip pratinjau produk */}
          <div className="relative z-10 my-6">
            <div className="rounded-2xl bg-white/95 backdrop-blur-xl border border-white/60 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.5)] p-4 rotate-[-1.5deg]">
              <div className="flex items-center gap-1.5 mb-3">
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="h-12 rounded-lg bg-gradient-to-br from-violet-600 to-violet-400" />
                <div className="h-12 rounded-lg bg-gradient-to-br from-blue-600 to-blue-400" />
                <div className="h-12 rounded-lg bg-gradient-to-br from-pink-600 to-pink-400" />
              </div>
              <svg width="100%" height="56" viewBox="0 0 300 56" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="loginPreviewLine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#7c3aed" />
                    <stop offset="100%" stopColor="#db2777" />
                  </linearGradient>
                </defs>
                <path d="M0,40 C30,20 60,45 90,25 C120,10 150,35 180,20 C210,8 240,30 270,15 L300,22" fill="none" stroke="url(#loginPreviewLine)" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <div className="relative z-10 flex flex-col gap-3">
            {[
              { label: "Kelola", value: "Talent", accent: "from-violet-500 to-violet-300" },
              { label: "Pantau", value: "Project", accent: "from-blue-500 to-blue-300" },
              { label: "Tinjau", value: "Approval", accent: "from-pink-500 to-pink-300" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl px-5 py-3.5 hover:bg-white/10 transition-colors"
              >
                <span className={`h-2.5 w-2.5 rounded-full bg-gradient-to-br ${stat.accent}`} />
                <span className="text-sm text-white/80 flex-1">{stat.label}</span>
                <span className="text-lg font-semibold text-white">{stat.value}</span>
              </div>
            ))}

            <div className="flex items-center justify-center gap-1.5 pt-2">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === 0 ? "w-6 bg-white" : "w-1.5 bg-white/30"}`} />
              ))}
            </div>
          </div>
        </div>

        {/* Panel kanan -- form, glass terang */}
        <div className="flex flex-col justify-center items-center px-8 md:px-16 py-8 overflow-y-auto bg-white">
          <div className="w-full max-w-sm">
            <h1 className="text-3xl font-extrabold text-slate-900">Selamat Datang</h1>
            <div className="h-1 w-12 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 mt-3 mb-4" />
            <p className="text-sm text-slate-500">
              Masuk untuk kelola talent, project, dan proses hiring Anda.
            </p>

            <div className="mt-7">
              <Suspense fallback={<div className="text-sm text-slate-400">Memuat...</div>}>
                <LoginForm googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
