"use client";
// The import and push steps of the Sheet Sync dialog (QA 2026-10-09). Import: 1 Kolom (matched automatically,
// AI for the rest), 2 Nilai (each sheet value of a choice field → ERP value), 3 Tinjau (status per row) → Import.
// Push: what would change in the team's sheet, then send. Every step asks the server again; nothing is written
// before the person presses Import or Kirim.
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Badge, Button, Callout, Checkbox, Segmented, Select } from "@crisp-ui-kit/crisp";
import { importCommit, importPreview, pushCommit, pushPreview, aiMapColumns, type ImportPreview, type ImportResult, type PushPreview, type PushResult } from "./sheet-import-actions";
import { EMPTY, KEEP, valueKey, type ColumnSource, type DateOrder, type RowStatus, type SheetKind, type ValueMaps } from "./sheet-import";

type Step = "columns" | "values" | "review";
type Ready = Extract<ImportPreview, { ok: true }>;

const SOURCE: Record<ColumnSource, { text: string; tone: "brand" | "warning" | "neutral" | "purple" }> = {
  saved: { text: "tersimpan", tone: "neutral" },
  exact: { text: "✦ otomatis", tone: "brand" },
  synonym: { text: "✦ otomatis", tone: "brand" },
  fuzzy: { text: "✦ mirip, cek", tone: "warning" },
  ai: { text: "✦ AI, cek", tone: "purple" },
};
const STATUS: Record<RowStatus, { text: string; tone: "success" | "brand" | "neutral" | "warning" | "danger" }> = {
  create: { text: "Baru", tone: "success" },
  update: { text: "Diubah", tone: "brand" },
  same: { text: "Sama", tone: "neutral" },
  skip: { text: "Dilewati", tone: "warning" },
  error: { text: "Error", tone: "danger" },
};

export function SheetImport({ kind }: { kind: SheetKind }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [data, setData] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("columns");
  const [columns, setColumns] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Record<string, ColumnSource | null>>({});
  const [values, setValues] = useState<ValueMaps>({});
  const [dateOrder, setDateOrder] = useState<DateOrder>("dmy");
  const [filter, setFilter] = useState<RowStatus | "all">("all");
  const [result, setResult] = useState<ImportResult | null>(null);

  const load = (override?: Parameters<typeof importPreview>[1], next?: Step) => start(async () => {
    const r = await importPreview(kind, override);
    if (!r.ok) return setError(r.error);
    setError(null);
    setData(r);
    setColumns(Object.fromEntries(r.headers.map((h) => [h, r.matches[h]?.field ?? ""])));
    setSources((prev) => Object.fromEntries(r.headers.map((h) => [h, prev[h] === "ai" && r.matches[h] ? "ai" : r.matches[h]?.source ?? null])));
    setDateOrder(r.dateOrder);
    if (next) setStep(next);
  });
  useEffect(() => load(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const fieldLabel = useMemo(() => Object.fromEntries((data?.fields ?? []).map((f) => [f.key, f.label])), [data]);
  if (!data) return <section className="text-[0.8125rem] text-slate-600">{error ? <Callout tone="danger">{error}</Callout> : "Membaca Google Sheet…"}</section>;

  const used = new Set(Object.values(columns).filter(Boolean));
  const missing = data.fields.filter((f) => f.required && !used.has(f.key)).map((f) => f.label);
  const unmapped = data.headers.filter((h) => !columns[h]);
  const override = () => ({ columns, values, dateOrder });
  const plan = data.plan;
  const needs = plan.distinct.filter((d) => !(values[d.field]?.[valueKey(d.raw)] ?? d.code));
  const importable = plan.summary.create + plan.summary.update;

  const setValue = (field: string, raw: string, code: string) => setValues((v) => ({ ...v, [field]: { ...v[field], [valueKey(raw)]: code } }));

  return (
    <section className="space-y-3 border-t border-slate-200 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented aria-label="Langkah import" value={step} onValueChange={(v) => setStep(v as Step)} options={[
          { value: "columns", label: "1 · Kolom" }, { value: "values", label: `2 · Nilai${needs.length ? ` (${needs.length})` : ""}` }, { value: "review", label: "3 · Tinjau & Import" },
        ]} />
        <span className="text-[0.75rem] text-slate-500">Tab <b>{data.tab}</b> · {plan.rows.length} baris{data.truncated ? " (5.000 pertama)" : ""}</span>
      </div>
      {error && <Callout tone="danger">{error}</Callout>}

      {step === "columns" && (
        <div className="space-y-3">
          <p className="text-[0.75rem] text-slate-600">
            {data.headers.length - unmapped.length} dari {data.headers.length} kolom sudah dipetakan otomatis. Periksa yang bertanda <b>mirip</b> atau <b>AI</b>; kolom yang tidak perlu biarkan "Abaikan".
          </p>
          {missing.length > 0 && <Callout tone="warning">Kolom wajib belum dipetakan: {missing.join(", ")}. Baris baru tidak bisa dibuat tanpa ini.</Callout>}
          <div className="flex flex-wrap items-center gap-2">
            {data.ai && unmapped.length > 0 && (
              <Button size="sm" intent="ghost" loading={pending} onClick={() => start(async () => {
                const r = await aiMapColumns(kind, unmapped.map((h) => ({ name: h, samples: data.samples[data.headers.indexOf(h)] ?? [] })));
                if (!r.ok) return setError(r.error);
                const taken = new Set(Object.values(columns).filter(Boolean));
                const add = Object.fromEntries(Object.entries(r.columns).filter(([, f]) => !taken.has(f)));
                setColumns((c) => ({ ...c, ...add }));
                setSources((s) => ({ ...s, ...Object.fromEntries(Object.keys(add).map((h) => [h, "ai" as const])) }));
                setError(Object.keys(add).length ? null : "AI tidak menemukan padanan yang yakin untuk kolom sisa.");
              })}>
                <Sparkles size={14} /> Petakan {unmapped.length} kolom sisa dengan AI
              </Button>
            )}
            <span className="ml-auto flex items-center gap-2 text-[0.75rem] text-slate-600">
              Tanggal di sheet
              <Segmented aria-label="Format tanggal" value={dateOrder} onValueChange={(v) => setDateOrder(v as DateOrder)} options={[{ value: "dmy", label: "DD/MM/YYYY" }, { value: "mdy", label: "MM/DD/YYYY" }]} />
            </span>
          </div>
          <div className="max-h-[45vh] overflow-auto rounded-md border border-slate-200">
            <table className="w-full text-[0.8125rem]">
              <thead className="sticky top-0 bg-slate-50 text-left text-[0.6875rem] uppercase text-slate-500">
                <tr><th className="px-3 py-2">Kolom di sheet</th><th className="px-3 py-2">Contoh isi</th><th className="px-3 py-2 w-[240px]">Jadi field ERP</th></tr>
              </thead>
              <tbody>
                {data.headers.map((h, i) => {
                  const src = columns[h] ? sources[h] : null;
                  return (
                    <tr key={h} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 font-medium text-slate-800">{h}</td>
                      <td className="max-w-[260px] truncate px-3 py-1.5 text-slate-500" title={data.samples[i]?.join(" · ")}>{data.samples[i]?.join(" · ") || "—"}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <Select size="small" value={columns[h] ?? ""} placeholder="Abaikan"
                            onValueChange={(f) => { setColumns((c) => ({ ...c, [h]: f })); setSources((s) => ({ ...s, [h]: f ? "saved" : null })); }}
                            options={[{ value: "", label: "Abaikan" }, ...data.fields.map((f) => ({ value: f.key, label: `${f.label}${f.required ? " *" : ""}`, disabled: used.has(f.key) && columns[h] !== f.key }))]} />
                          {src && <Badge size="small" tone={SOURCE[src].tone}>{SOURCE[src].text}</Badge>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button size="sm" intent="primary" loading={pending} onClick={() => load(override(), "values")}>Simpan & lanjut: cek nilai</Button>
        </div>
      )}

      {step === "values" && (
        <div className="space-y-3">
          <p className="text-[0.75rem] text-slate-600">
            Isi kolom pilihan (Status, Layanan, Level, PIC, dan lainnya) dicocokkan ke pilihan ERP. Yang bertanda <b>✦</b> dicocokkan otomatis; yang merah harus dipilih.
            Pilihan disimpan untuk sync berikutnya.
          </p>
          {plan.distinct.length === 0 && <p className="text-[0.8125rem] text-slate-500">Tidak ada kolom pilihan yang dipetakan.</p>}
          <div className="max-h-[45vh] space-y-3 overflow-auto">
            {[...new Set(plan.distinct.map((d) => d.field))].map((field) => (
              <div key={field} className="rounded-md border border-slate-200">
                <p className="bg-slate-50 px-3 py-1.5 text-[0.75rem] font-semibold text-slate-700">{fieldLabel[field]}</p>
                {plan.distinct.filter((d) => d.field === field).map((d) => {
                  const chosen = values[field]?.[valueKey(d.raw)] ?? d.code ?? "";
                  const pic = field === "sales_pic_name";
                  return (
                    <div key={d.raw} className={`grid grid-cols-[1fr_auto_260px] items-center gap-2 border-t border-slate-100 px-3 py-1.5 text-[0.8125rem] ${chosen ? "" : "bg-red-50"}`}>
                      <span className="truncate text-slate-800">"{d.raw}" <span className="text-slate-400">×{d.count}</span></span>
                      {d.source === "auto" && !values[field]?.[valueKey(d.raw)] ? <Badge size="small" tone="brand">✦ otomatis</Badge> : <span />}
                      <Select size="small" value={chosen} placeholder="Pilih padanannya" onValueChange={(code) => setValue(field, d.raw, code)}
                        options={[...(data.options[field] ?? []), ...(pic ? [{ value: KEEP, label: "Simpan apa adanya (nama lama)" }] : []), { value: EMPTY, label: "Kosongkan" }]} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <Button size="sm" intent="primary" loading={pending} onClick={() => load(override(), "review")}>Simpan & lanjut: tinjau</Button>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(["all", "create", "update", "same", "skip", "error"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setFilter(s)}
                className={`rounded-full border px-2.5 py-0.5 text-[0.75rem] ${filter === s ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                {s === "all" ? `Semua ${plan.rows.length}` : `${STATUS[s].text} ${plan.summary[s]}`}
              </button>
            ))}
          </div>
          {plan.summary.error > 0 && <Callout tone="warning">{plan.summary.error} baris error tidak ikut diimport. Perbaiki di sheet atau di langkah Nilai, lalu tinjau lagi.</Callout>}
          <div className="max-h-[42vh] overflow-auto rounded-md border border-slate-200">
            <table className="w-full text-[0.8125rem]">
              <thead className="sticky top-0 bg-slate-50 text-left text-[0.6875rem] uppercase text-slate-500">
                <tr><th className="px-3 py-2 w-14">Baris</th><th className="px-3 py-2 w-24">Status</th><th className="px-3 py-2">Record</th><th className="px-3 py-2">Keterangan</th></tr>
              </thead>
              <tbody>
                {plan.rows.filter((r) => filter === "all" || r.status === filter).map((r) => (
                  <tr key={r.row} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-1.5 text-slate-500">{r.row}</td>
                    <td className="px-3 py-1.5"><Badge size="small" tone={STATUS[r.status].tone}>{STATUS[r.status].text}</Badge></td>
                    <td className="px-3 py-1.5"><span className="block font-medium text-slate-800">{r.label || "—"}</span>{r.key && <span className="text-[0.75rem] text-slate-500">{r.key}</span>}</td>
                    <td className="px-3 py-1.5 text-slate-600">
                      {r.issues.map((x) => <span key={x} className="block">{x}</span>)}
                      {r.changes.map((c) => <span key={c.field} className="block"><b>{fieldLabel[c.field] ?? c.field}</b>: <s className="text-slate-400">{c.old ?? "—"}</s> → {c.new ?? "—"}</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result?.ok ? (
            <Callout tone="success" title="Import selesai">
              {result.created} baru, {result.updated} diubah, {result.same} sama, {result.skipped} dilewati{result.failed.length ? `, ${result.failed.length} error tidak diimport` : ""}. Perubahan tercatat di Riwayat.
            </Callout>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" intent="primary" loading={pending} disabled={!importable} onClick={() => start(async () => {
                const r = await importCommit(kind, override());
                setResult(r);
                if (!r.ok) setError(r.error);
                else { router.refresh(); load(); }
              })}>Import {importable} baris</Button>
              <span className="text-[0.75rem] text-slate-500">{plan.summary.create} baru · {plan.summary.update} diubah. Sel kosong di sheet tidak menghapus data di ERP.</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** ERP → the team's sheet: shows what would change first. Sales Full or Owner. */
export function SheetPush({ kind }: { kind: SheetKind }) {
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<PushPreview | null>(null);
  const [append, setAppend] = useState(false);
  const [result, setResult] = useState<PushResult | null>(null);
  return (
    <section className="space-y-2 border-t border-slate-200 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[0.8125rem] font-semibold text-slate-800">Kirim perubahan ERP ke Sheet</h3>
        <Button size="sm" intent="ghost" loading={pending && !preview} onClick={() => start(async () => { setResult(null); setPreview(await pushPreview(kind)); })}>Cek perubahan</Button>
      </div>
      <p className="text-[0.75rem] text-slate-500">Hanya kolom yang dipetakan, hanya baris yang Opty No-nya cocok. Kolom lain, format dan tab lain tidak disentuh.</p>
      {preview && !preview.ok && <Callout tone="danger">{preview.error}</Callout>}
      {preview?.ok && !result && (
        <div className="space-y-2 rounded-md border border-slate-200 p-3 text-[0.8125rem]">
          <p><b>{preview.cells}</b> sel di <b>{preview.rows}</b> baris tab {preview.tab} akan diubah.</p>
          {preview.sample.length > 0 && (
            <ul className="max-h-40 overflow-auto text-[0.75rem] text-slate-600">
              {preview.sample.map((x) => <li key={x.at}><b>{x.at}</b>: <s className="text-slate-400">{x.old ?? "—"}</s> → {x.value}</li>)}
            </ul>
          )}
          {preview.append > 0 && (
            <label className="flex items-center gap-2"><Checkbox checked={append} onChange={(e) => setAppend(e.target.checked)} /> Tambahkan juga {preview.append} record ERP yang belum ada di sheet (di baris paling bawah)</label>
          )}
          <Button size="sm" intent="primary" loading={pending} disabled={!preview.cells && !(append && preview.append)}
            onClick={() => start(async () => setResult(await pushCommit(kind, append)))}>
            Kirim {preview.cells} perubahan{append && preview.append ? ` + ${preview.append} baris` : ""}
          </Button>
        </div>
      )}
      {result && (result.ok ? <Callout tone="success">{result.cells} sel diubah{result.appended ? `, ${result.appended} baris ditambah` : ""}.</Callout> : <Callout tone="danger">{result.error}</Callout>)}
    </section>
  );
}
