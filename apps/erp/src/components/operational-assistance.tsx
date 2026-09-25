"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  ClipboardList,
  Lightbulb,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { createFeatureRequest } from "@/app/feature-requests/actions";
import {
  operationalContext,
  MODULES,
  type Context,
  type OperationalContextResponse,
  type OperationalGroup,
} from "@/lib/operations/policy";
const inputClass =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400";
function ContextualFeedback({ context }: { context: Context }) {
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
function AttentionGroup({ group }: { group: OperationalGroup }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {MODULES[group.module]}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">
            {group.title}
          </h3>
        </div>
        <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-sm font-bold text-amber-800">
          {group.count}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {group.count} {group.unit} · {group.source}
      </p>
      <details className="mt-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-brand-600">
          Mengapa perlu ditinjau?
        </summary>
        <p className="pt-2 leading-relaxed">{group.rule}</p>
      </details>
      <ul className="mt-3 divide-y divide-slate-100">
        {group.items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex items-center justify-between gap-2 py-2 text-xs text-slate-700 hover:text-brand-600"
            >
              <span className="break-words">{item.label}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      {group.count > group.items.length && (
        <p className="mt-1 text-xs text-slate-500">
          Menampilkan {group.items.length} dari {group.count}; buka modul untuk
          sisanya.
        </p>
      )}
      <Link
        href={group.href}
        className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-brand-600"
      >
        {group.action}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </article>
  );
}
export function OperationalAssistance() {
  const pathname = usePathname();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    data?: OperationalContextResponse;
    error?: string;
  }>();
  const [loading, setLoading] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const context = operationalContext(pathname);
  const current = result?.path === pathname ? result : undefined;
  const data = current?.data;
  const attention = data?.groups.filter((g) => g.count > 0) ?? [];
  const clear = data?.groups.filter((g) => g.count === 0) ?? [];
  useEffect(() => {
    setOpen(false);
    setFeedback(false);
  }, [pathname]);
  useEffect(() => {
    if (status !== "authenticated") {
      setResult(undefined);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/operations/context?path=${encodeURIComponent(pathname)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ path: pathname, data });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({
            path: pathname,
            error: "Ringkasan belum dapat dimuat. Coba muat ulang.",
          });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [pathname, status, refresh]);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const reload = () => {
      if (document.visibilityState === "visible") setRefresh((n) => n + 1);
    };
    document.addEventListener("keydown", escape);
    window.addEventListener("focus", reload);
    const interval = window.setInterval(reload, 60000);
    return () => {
      document.removeEventListener("keydown", escape);
      window.removeEventListener("focus", reload);
      window.clearInterval(interval);
    };
  }, [open]);
  if (status !== "authenticated") return null;
  return (
    <>
      <button
        ref={trigger}
        onClick={() => {
          setOpen(!open);
          if (!open) setRefresh((n) => n + 1);
        }}
        aria-expanded={open}
        aria-controls="operational-assistance"
        className="fixed bottom-6 right-6 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-gradient-to-br from-brand-600 to-brand-800 px-5 text-sm font-semibold text-white shadow-lg hover:from-brand-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600"
      >
        <ClipboardList className="h-5 w-5" />
        <span>Bantuan</span>
        {attention.length > 0 && (
          <span
            className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900"
            aria-label={`${attention.length} kondisi perlu ditinjau`}
          >
            {attention.length}
          </span>
        )}
      </button>
      {open && (
        <section
          id="operational-assistance"
          role="dialog"
          aria-labelledby="operational-title"
          className="fixed bottom-24 right-3 z-40 flex max-h-[calc(100dvh-7rem)] w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:right-6 sm:w-[420px]"
        >
          <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
            <div>
              <h2
                id="operational-title"
                className="text-base font-semibold text-slate-900"
              >
                Bantuan Operasional
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {context.label} · ringkasan modul
              </p>
            </div>
            <button
              ref={close}
              aria-label="Tutup bantuan"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          <nav
            className="flex gap-2 border-b border-slate-100 px-5 py-3"
            aria-label="Isi bantuan"
          >
            <button
              aria-pressed={!feedback}
              onClick={() => setFeedback(false)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${!feedback ? "bg-brand-50 text-brand-700" : "text-slate-500"}`}
            >
              Perlu perhatian
            </button>
            <button
              aria-pressed={feedback}
              onClick={() => setFeedback(true)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${feedback ? "bg-pink-50 text-pink-700" : "text-slate-500"}`}
            >
              <Lightbulb className="h-3.5 w-3.5" />
              Masukan
            </button>
          </nav>
          <div className="overflow-y-auto overscroll-contain p-5">
            {feedback ? (
              <ContextualFeedback context={context} />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {data
                      ? `Diperiksa ${new Date(data.asOf).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })} WIB`
                      : "Kondisi dari ERP"}
                  </span>
                  <button
                    aria-label="Muat ulang ringkasan"
                    disabled={loading}
                    onClick={() => setRefresh((n) => n + 1)}
                    className="inline-flex items-center gap-1.5 rounded-lg p-2 text-brand-600 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                    />
                    Muat ulang
                  </button>
                </div>
                {loading && !data && (
                  <p
                    role="status"
                    className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600"
                  >
                    Memeriksa kondisi ERP…
                  </p>
                )}
                {current?.error && (
                  <div
                    role="alert"
                    className="flex gap-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"
                  >
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    {current.error}
                  </div>
                )}
                {data && (
                  <>
                    <p className="text-xs leading-relaxed text-slate-500">
                      {data.coverage}
                    </p>
                    {attention.map((group) => (
                      <AttentionGroup key={group.key} group={group} />
                    ))}
                    {!attention.length && data.groups.length > 0 && (
                      <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
                        <CheckCircle2 className="mb-2 h-5 w-5" />
                        Tidak ada record yang memenuhi kondisi perhatian yang
                        diperiksa.
                      </div>
                    )}
                    {clear.length > 0 && (
                      <details className="rounded-xl border border-slate-200 p-3 text-xs text-slate-500">
                        <summary className="cursor-pointer">
                          {clear.length} kondisi lain sudah diperiksa
                        </summary>
                        <ul className="mt-3 space-y-2">
                          {clear.map((g) => (
                            <li key={g.key}>
                              {g.title}: 0 {g.unit}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                )}
                <button
                  onClick={() => setFeedback(true)}
                  className="w-full rounded-xl border border-pink-200 bg-pink-50 px-4 py-3 text-left text-sm font-medium text-pink-800"
                >
                  Ada kendala di halaman ini? Kirim masukan →
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
