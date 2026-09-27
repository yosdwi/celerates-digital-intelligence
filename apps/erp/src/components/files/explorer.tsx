"use client";
// Company Files explorer (ADR-018). Search is authorized per request by ERP policy (class × division × linked record);
// opening a file goes through /api/files/{id}/content (managed: Intelligence, ERP: ERP's document route). A class badge
// tells users how widely a file may be read; nothing here can loosen a class except an Owner.
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, Loader2, Search, Upload, X } from "lucide-react";

type Link = { entity_type: string; entity_id: string; label: string | null; href: string | null };
type Hit = {
  id: string; title: string; kind: string; access_class: Cls; origin: "managed" | "erp" | "external"; owner_division: string | null;
  state: string; version: number; links: Link[]; page?: number | null; snippet?: string; content_shared: boolean;
};
type Version = { version: number; name: string; media_type: string | null; size_bytes: number | null; created_at: string; ingest_state: string; error: string | null; parser: string | null; pages: number | null; ocr_pages: number | null; tables: number | null; flags: string[] };
type Detail = Hit & { created_by_name: string | null; created_at: string; versions: Version[]; can_manage: boolean };
type Cls = "general" | "division" | "commercial" | "personal";
type Kinds = { kinds: { kind: string; label: string; access_class: Cls }[]; access: { owner: boolean; divisions: string[]; commercial: string[]; personal: string[] } };

const CLASS: Record<Cls, { label: string; tone: string; note: string }> = {
  general: { label: "Umum", tone: "bg-emerald-50 text-emerald-800", note: "Semua pengguna ERP" },
  division: { label: "Divisi", tone: "bg-sky-50 text-sky-800", note: "Pembaca divisi pemilik" },
  commercial: { label: "Komersial", tone: "bg-amber-50 text-amber-900", note: "Pemegang akses komersial divisi, dan pembaca record tertaut; isi tidak dibagikan ke model" },
  personal: { label: "Personal", tone: "bg-rose-50 text-rose-800", note: "Pemegang akses personal divisi, dan pembaca record tertaut; isi tidak dibagikan ke model" },
};
const ORIGIN = { managed: "Diunggah di Company Files", erp: "Lampiran ERP", external: "Tautan luar" };
const STATE: Record<string, string> = { queued: "Menunggu dibaca", running: "Sedang dibaca", indexed: "Dapat dicari", metadata_only: "Metadata saja", failed: "Gagal dibaca" };
const DIVISIONS = ["marketing", "sales", "ta", "hr", "tm", "pmo", "finance"];

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Company Files belum dapat diproses.");
  return body as T;
}

function ClassBadge({ value }: { value: Cls }) {
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${CLASS[value].tone}`} title={CLASS[value].note} data-file-class={value}>{CLASS[value].label}</span>;
}

export function FilesExplorer({ initialFile, initialQuery }: { initialFile: string | null; initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState("");
  const [items, setItems] = useState<Hit[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(initialFile);
  const [kinds, setKinds] = useState<Kinds | null>(null);
  const [uploading, setUploading] = useState(false);
  const run = useCallback(async (q: string, k: string) => {
    setBusy(true);
    setError("");
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (k) params.set("kind", k);
    try {
      setItems((await json<{ items: Hit[] }>(`/api/files?${params}`)).items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void run(initialQuery, "");
    json<Kinds>("/api/files/kinds").then(setKinds).catch(() => undefined);
  }, [run, initialQuery]);

  return (
    <div className="space-y-6">
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void run(query, kind); }} role="search">
        <label className="relative flex-1">
          <span className="sr-only">Cari berkas</span>
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari isi, judul, atau record — mis. kontrak Astra, CV Java, BAST Maret" className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </label>
        <select aria-label="Jenis berkas" value={kind} onChange={(e) => { setKind(e.target.value); void run(query, e.target.value); }} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="">Semua jenis</option>
          {kinds?.kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
        </select>
        <button className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Cari</button>
        <button type="button" onClick={() => setUploading(true)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"><Upload className="h-4 w-4" /> Unggah</button>
      </form>
      {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
      {uploading && kinds && <UploadForm kinds={kinds} onClose={() => setUploading(false)} onDone={(id) => { setUploading(false); setOpen(id); void run(query, kind); }} />}
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white" data-files-results>
        {items?.map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => setOpen(f.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50" data-file-row={f.id}>
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{f.title}</span>
                  <ClassBadge value={f.access_class} />
                  <span className="text-xs text-slate-500">{f.kind}{f.page ? ` · hal. ${f.page}` : ""} · {ORIGIN[f.origin]}</span>
                  {f.state === "pending_review" && <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-800">Ditahan untuk ditinjau</span>}
                </span>
                {f.snippet && <span className="mt-1 block text-sm text-slate-600">{f.snippet}</span>}
                {f.links.length > 0 && <span className="mt-1 block text-xs text-slate-500">Tertaut: {f.links.map((l) => l.label ?? l.entity_type).join(" · ")}</span>}
              </span>
            </button>
          </li>
        ))}
        {items && !items.length && <li className="px-4 py-6 text-sm text-slate-500">Tidak ada berkas yang cocok dan dapat Anda akses.</li>}
        {!items && <li className="px-4 py-6 text-sm text-slate-500">Memuat…</li>}
      </ul>
      {open && <FileDetail id={open} onClose={() => setOpen(null)} onChanged={() => void run(query, kind)} />}
    </div>
  );
}

function UploadForm({ kinds, onClose, onDone }: { kinds: Kinds; onClose: () => void; onDone: (id: string) => void }) {
  const [kind, setKind] = useState(kinds.kinds[0]?.kind ?? "sop");
  const spec = kinds.kinds.find((k) => k.kind === kind);
  const [cls, setCls] = useState<Cls>(spec?.access_class ?? "general");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const rank = { general: 0, division: 1, commercial: 2, personal: 3 };
  useEffect(() => setCls(spec?.access_class ?? "general"), [spec?.access_class]);
  const allowed = (Object.keys(CLASS) as Cls[]).filter((c) => kinds.access.owner || rank[c] >= rank[spec?.access_class ?? "general"]);
  const divisions = cls === "general" ? [] : kinds.access.owner ? DIVISIONS : cls === "division" ? kinds.access.divisions : kinds.access[cls];
  return (
    <form
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
      data-files-upload
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError("");
        try {
          const body = new FormData(e.currentTarget);
          const out = await json<{ id: string }>("/api/files", { method: "POST", body });
          onDone(out.id);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-900">Unggah ke Company Files</h2><button type="button" aria-label="Tutup" onClick={onClose}><X className="h-4 w-4" /></button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-600">Berkas<input name="file" type="file" required accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg" className="mt-1 block w-full text-sm" /></label>
        <label className="text-xs text-slate-600">Judul<input name="title" maxLength={200} placeholder="Opsional; nama berkas bila kosong" className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" /></label>
        <label className="text-xs text-slate-600">Jenis<select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">{kinds.kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}</select></label>
        <label className="text-xs text-slate-600">Kelas akses<select name="access_class" value={cls} onChange={(e) => setCls(e.target.value as Cls)} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">{allowed.map((c) => <option key={c} value={c}>{CLASS[c].label} — {CLASS[c].note}</option>)}</select></label>
        {cls !== "general" && (
          <label className="text-xs text-slate-600">Divisi pemilik<select name="owner_division" required className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">{divisions.map((d) => <option key={d} value={d}>{d.toUpperCase()}</option>)}</select></label>
        )}
      </div>
      <p className="text-xs text-slate-500">Kelas minimal mengikuti jenis berkas; kelas yang lebih longgar hanya dapat dipilih Owner. Berkas berisi pola dokumen identitas (NIK, NPWP, KTP) ditahan untuk ditinjau. Jangan unggah KTP, KK, atau slip gaji di sini.</p>
      {error && <p role="alert" className="text-sm text-amber-900">{error}</p>}
      <button disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{pending && <Loader2 className="h-4 w-4 animate-spin" />} Unggah</button>
    </form>
  );
}

function FileDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [file, setFile] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const close = useRef<HTMLButtonElement>(null);
  const load = useCallback(() => json<Detail>(`/api/files/${id}`).then(setFile).catch((e) => setError(e.message)), [id]);
  useEffect(() => { void load(); close.current?.focus(); }, [load]);
  const current = file?.versions[0];
  return (
    <section role="dialog" aria-label="Detail berkas" className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()} data-file-detail={id}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">{file?.title ?? "Berkas"}</h2>
          <button ref={close} aria-label="Tutup detail" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-amber-900">{error}</p>}
        {file && (
          <div className="mt-3 space-y-4 text-sm">
            <p className="flex flex-wrap items-center gap-2"><ClassBadge value={file.access_class} /><span className="text-slate-600">{file.kind} · {ORIGIN[file.origin]}{file.owner_division ? ` · ${file.owner_division.toUpperCase()}` : ""}</span></p>
            <p className="text-xs text-slate-500">{CLASS[file.access_class].note}.</p>
            {file.state === "pending_review" && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-800">Ditahan: isi berkas memuat pola dokumen identitas. Hanya pengunggah dan Owner yang melihatnya sampai kelasnya ditinjau.</p>}
            <div className="flex flex-wrap gap-2">
              <a href={`/api/files/${file.id}/content?preview=1`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white" data-file-open>Buka <ExternalLink className="h-3.5 w-3.5" /></a>
              {file.can_manage && file.state !== "withdrawn" && (
                <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700" onClick={async () => { await json(`/api/files/${file.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "withdraw" }) }).catch((e) => setError(e.message)); onChanged(); onClose(); }}>Tarik berkas</button>
              )}
            </div>
            {current && (
              <p className="text-xs text-slate-600" data-file-ingest={current.ingest_state}>
                Versi {current.version} · {STATE[current.ingest_state] ?? current.ingest_state}
                {current.pages ? ` · ${current.pages} hal.` : ""}{current.ocr_pages ? ` · OCR ${current.ocr_pages} hal.` : ""}{current.tables ? ` · ${current.tables} tabel` : ""}
                {current.flags.length ? ` · pola identitas: ${current.flags.join(", ")}` : ""}
              </p>
            )}
            {file.links.length > 0 && (
              <div><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tertaut ke</h3>
                <ul className="mt-1 space-y-1">{file.links.map((l) => <li key={l.entity_type + l.entity_id}>{l.href ? <a className="text-brand-600 hover:underline" href={l.href}>{l.label ?? l.entity_type}</a> : l.label ?? l.entity_type}</li>)}</ul>
              </div>
            )}
            <div><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Versi</h3>
              <ul className="mt-1 space-y-1 text-xs text-slate-600">{file.versions.map((v) => <li key={v.version}>v{v.version} · {v.name} · {new Date(v.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} · {STATE[v.ingest_state] ?? v.ingest_state}{v.error ? ` (${v.error})` : ""}</li>)}</ul>
            </div>
            <p className="text-xs text-slate-500">Diunggah oleh {file.created_by_name ?? "—"}. Setiap pembukaan berkas dicatat.</p>
          </div>
        )}
      </div>
    </section>
  );
}
