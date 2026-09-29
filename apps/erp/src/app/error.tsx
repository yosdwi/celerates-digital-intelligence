"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Error boundary global -- tanpa ini, kalau sebuah Server Action/halaman
 * throw (mis. query DB gagal), Next.js cuma nampilin layar error mentah
 * tanpa pesan jelas atau cara untuk retry, dan form yang sedang diisi
 * terasa "hilang begitu saja" tanpa notifikasi apa pun ke user.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle className="h-6 w-6 text-red-600" />
        </div>
        <h1 className="text-lg font-semibold text-slate-800">Terjadi Kesalahan</h1>
        <p className="mt-2 text-sm text-slate-500">
          Proses tadi gagal diselesaikan. Data yang belum tersimpan mungkin perlu diisi ulang.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-slate-400">Kode error: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          Coba Lagi
        </button>
      </div>
    </div>
  );
}
