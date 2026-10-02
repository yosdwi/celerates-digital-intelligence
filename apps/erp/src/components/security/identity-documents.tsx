"use client";
// Identity documents panel (docs/security/04). Lists status metadata only; the file itself is fetched on demand,
// after the server's policy + step-up + audit, and shown from an in-memory blob that is dropped when closed.
import { useCallback, useEffect, useState } from "react";
import { useStepUp } from "./step-up";

type Doc = { id: string | null; doc_type: string; status: "absent" | "uploaded" | "verified" | "rejected"; verified_at: string | null; uploaded_at: string | null };
const LABEL: Record<string, string> = { ktp: "KTP", kk: "Kartu Keluarga", npwp: "NPWP", bpjs_kesehatan: "BPJS Kesehatan", bpjs_ketenagakerjaan: "BPJS Ketenagakerjaan" };
const STATUS: Record<Doc["status"], string> = { absent: "Belum ada", uploaded: "Terunggah, belum diverifikasi", verified: "Terverifikasi", rejected: "Ditolak" };
const ERRORS: Record<string, string> = {
  missing_capability: "Anda tidak memiliki izin dokumen identitas.",
  out_of_scope: "Dokumen ini di luar cakupan akses Anda.",
  unsupported_content: "File harus JPEG, PNG, atau PDF asli.",
  type_mismatch: "Isi file tidak sesuai dengan jenis file-nya.",
  invalid_size: "Ukuran file maksimum 5 MB.",
  not_found: "Dokumen tidak tersedia.",
};

export function IdentityDocuments({ subjectKind, subjectId, talent = false }: { subjectKind: "onboarding" | "employee" | "self"; subjectId?: string; talent?: boolean }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{ url: string; type: string; label: string } | null>(null);
  const { ensure, dialog } = useStepUp();
  const query = `subject_kind=${subjectKind}${subjectId ? `&subject_id=${subjectId}` : ""}`;

  const load = useCallback(async () => {
    const res = await fetch(`/api/identity-documents?${query}`, { cache: "no-store" });
    if (!res.ok) return setHidden(true);
    setDocs((await res.json()).documents);
  }, [query]);
  useEffect(() => void load(), [load]);
  useEffect(() => () => {
    if (view) URL.revokeObjectURL(view.url);
  }, [view]);

  /** Runs a request; on step_up_required asks for a code (backoffice) and retries once. */
  async function withStepUp(run: () => Promise<Response>): Promise<Response | null> {
    let res = await run();
    if (res.status === 401) {
      if (talent) {
        setMessage("Untuk melihat dokumen, buka tautan terbaru dari WhatsApp (ketik masuk ke bot), lalu coba lagi.");
        return null;
      }
      if (!(await ensure())) return null;
      res = await run();
    }
    return res;
  }

  async function open(doc: Doc) {
    setMessage(null);
    setBusy(true);
    const res = await withStepUp(() => fetch(`/api/identity-documents/${doc.id}`, { cache: "no-store" }));
    setBusy(false);
    if (!res) return;
    if (!res.ok) return setMessage(ERRORS[(await res.json().catch(() => ({}))).error] ?? "Dokumen tidak dapat dibuka.");
    const blob = await res.blob();
    setView({ url: URL.createObjectURL(blob), type: blob.type, label: LABEL[doc.doc_type] });
  }

  async function decide(doc: Doc, status: "verified" | "rejected") {
    setBusy(true);
    const res = await withStepUp(() =>
      fetch(`/api/identity-documents/${doc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }),
    );
    setBusy(false);
    if (res && !res.ok) setMessage(ERRORS[(await res.json().catch(() => ({}))).error] ?? "Gagal menyimpan verifikasi.");
    await load();
  }

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("subject_kind", subjectKind);
    if (subjectId) form.set("subject_id", subjectId);
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/identity-documents", { method: "POST", body: form });
    setBusy(false);
    if (!res.ok) return setMessage(ERRORS[(await res.json().catch(() => ({}))).error] ?? "Unggah gagal.");
    (e.target as HTMLFormElement).reset();
    setMessage("Dokumen tersimpan terenkripsi.");
    await load();
  }

  if (hidden) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">Dokumen Identitas</h2>
      <p className="mt-1 text-xs text-slate-500">Disimpan terenkripsi. Membuka dokumen memerlukan izin khusus dan konfirmasi, dan selalu tercatat.</p>
      {!docs ? (
        <p className="mt-4 text-sm text-slate-400">Memuat…</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {docs.map((d) => (
            <li key={d.doc_type} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-medium text-slate-800">{LABEL[d.doc_type]}</span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-slate-500">{STATUS[d.status]}</span>
                {d.id && (
                  <button type="button" disabled={busy} onClick={() => open(d)} className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50">
                    Lihat
                  </button>
                )}
                {d.id && !talent && d.status === "uploaded" && (
                  <>
                    <button type="button" disabled={busy} onClick={() => decide(d, "verified")} className="text-xs text-emerald-700 hover:underline disabled:opacity-50">Verifikasi</button>
                    <button type="button" disabled={busy} onClick={() => decide(d, "rejected")} className="text-xs text-red-600 hover:underline disabled:opacity-50">Tolak</button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={upload} className="mt-4 flex flex-wrap items-center gap-2">
        <select name="doc_type" defaultValue="ktp" aria-label="Jenis dokumen" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          {Object.entries(LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input name="file" type="file" required accept="image/jpeg,image/png,application/pdf" aria-label="File dokumen" className="text-sm" />
        <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Unggah</button>
      </form>
      {message && <p className="mt-2 text-sm text-slate-600" role="status">{message}</p>}
      {view && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-label={view.label}>
          <div className="flex max-h-full w-full max-w-3xl flex-col rounded-xl bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800">{view.label}</span>
              <button type="button" onClick={() => setView(null)} className="text-sm text-slate-500 hover:underline">Tutup</button>
            </div>
            {view.type === "application/pdf" ? (
              <iframe src={view.url} title={view.label} className="h-[75vh] w-full rounded border" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={view.url} alt={view.label} className="max-h-[75vh] object-contain" />
            )}
          </div>
        </div>
      )}
      {dialog}
    </section>
  );
}
