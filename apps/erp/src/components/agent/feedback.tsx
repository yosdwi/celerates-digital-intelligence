"use client";
// `Masukan`: unchanged contextual Feature Request capability, moved from operational-assistance.tsx (M1).
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { createFeatureRequest } from "@/app/feature-requests/actions";
import type { Context } from "@/lib/operations/policy";
const inputClass =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400";
export function ContextualFeedback({ context }: { context: Context }) {
  const [origin] = useState(context);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    form.set("context_path", origin.path);
    form.set(
      "module_area_code",
      ["timesheet", "attendance", "school", "automation"].includes(
        origin.module,
      )
        ? "general"
        : origin.module,
    );
    form.set("priority_code", "medium");
    setPending(true);
    setError("");
    try {
      await createFeatureRequest(form);
      setSaved(true);
    } catch {
      setError(
        "Belum dapat memastikan penyimpanan. Periksa Feature Request sebelum mencoba lagi.",
      );
    } finally {
      setPending(false);
    }
  }
  if (saved)
    return (
      <div
        role="status"
        className="space-y-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"
      >
        <CheckCircle2 className="h-5 w-5" />
        <p>
          Masukan tersimpan di Feature Request. Konteks halaman dan rilis ikut
          tercatat untuk review BA.
        </p>
        <Link href="/feature-requests" className="font-semibold underline">
          Lihat Feature Request →
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-600">
        Ada kendala atau proses yang perlu diperbaiki? Masukan masuk ke Feature
        Request yang sudah digunakan tim.
      </p>
      <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <strong>{origin.label}</strong>
        <p className="mt-1 break-all">{origin.path}</p>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Jenis masukan
        <select
          name="request_type_code"
          defaultValue="improvement"
          className={inputClass}
        >
          <option value="improvement">Peningkatan / Improvement</option>
          <option value="bug_fix">Bug Fix</option>
          <option value="data_fix">Perbaikan Data</option>
          <option value="new_feature">Fitur Baru</option>
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Judul
        <input
          name="title"
          required
          maxLength={200}
          className={inputClass}
          placeholder="Contoh: status handoff sulit ditemukan"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Kendala / kebutuhan
        <textarea
          name="description"
          required
          maxLength={5000}
          rows={3}
          className={inputClass}
          placeholder="Apa yang terjadi saat menjalankan proses ini?"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Hasil yang diharapkan
        <textarea
          name="expected_behavior"
          maxLength={3000}
          rows={2}
          className={inputClass}
        />
      </label>
      <p className="text-xs text-slate-500">
        Cukup tulis proses dan nomor referensi. Hindari menyalin gaji, data
        pribadi, atau kredensial.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Menyimpan…" : "Kirim Feature Request"}
      </button>
      <Link
        href={`/feature-requests?from=${encodeURIComponent(origin.path)}`}
        className="block text-center text-xs text-brand-600 underline"
      >
        Buka form lengkap & lampiran
      </Link>
    </form>
  );
}
