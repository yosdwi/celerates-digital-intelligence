"use client";
// ERP-held proposal card (ADR-010). The card always renders the proposal as ERP stores it, never the Agent's copy.
// Confirming is a deliberate click by the signed-in user against the stored digest; ERP re-validates every item with
// the user's current access, applies each in its own savepoint and returns receipts. Voice can never confirm.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleSlash, Loader2, ShieldCheck, XCircle } from "lucide-react";

type Field = { name: string; label: string; kind: string; required: boolean; options: { value: string; label: string }[] | null };
type Item = {
  index: number;
  kind: string;
  summary: string;
  target_label: string | null;
  params: Record<string, unknown>;
  editable: string[];
  validation: { state: "ok" | "warning" | "needs_input" | "invalid"; messages: string[] };
  fields: Field[];
  receipt: { state: "applied" | "skipped" | "failed"; message: string | null } | null;
  outcome: "resolved" | "open" | "unknown" | null;
  href: string | null;
};
export type Proposal = {
  id: string;
  title: string;
  state: "pending" | "applied" | "partially_applied" | "failed" | "rejected" | "expired";
  sha256: string;
  expires_at: string;
  counts: Record<"ok" | "warning" | "needs_input" | "invalid", number>;
  receipts: Record<"applied" | "skipped" | "failed", number>;
  outcome: Record<"resolved" | "open" | "unknown", number> | null;
  items: Item[];
};

export const STATE_LABEL: Record<Proposal["state"], string> = {
  pending: "Menunggu konfirmasi Anda",
  applied: "Diterapkan",
  partially_applied: "Sebagian diterapkan",
  failed: "Tidak ada yang diterapkan",
  rejected: "Ditolak",
  expired: "Kedaluwarsa",
};
const VALIDATION = {
  ok: { label: "Siap", className: "text-emerald-700" },
  warning: { label: "Perlu dicek", className: "text-amber-700" },
  needs_input: { label: "Lengkapi", className: "text-brand-700" },
  invalid: { label: "Tidak dapat diterapkan", className: "text-red-700" },
} as const;

function complete(item: Item, values: Record<string, unknown>) {
  return item.fields.every((f) => !f.required || (values[f.name] !== undefined && values[f.name] !== ""));
}

function FieldInput({ field, value, onChange, disabled }: { field: Field; value: unknown; onChange: (v: string) => void; disabled: boolean }) {
  const common = "mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-slate-50";
  const text = value === undefined || value === null ? "" : String(value);
  return (
    <label className="block text-[11px] font-medium text-slate-600">
      {field.label}
      {field.required && <span className="text-red-600"> *</span>}
      {field.options ? (
        <select className={common} value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="">— pilih —</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={common}
          value={text}
          disabled={disabled}
          type={field.kind === "date" ? "date" : field.kind === "int" ? "number" : "text"}
          min={field.kind === "int" ? 1 : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

export function ProposalCard({ id, title, onDecided }: { id: string; title?: string; onDecided?: (p: Proposal) => void }) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [include, setInclude] = useState<Record<number, boolean>>({});
  const [values, setValues] = useState<Record<number, Record<string, unknown>>>({});

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch(`/api/agent/proposals/${id}`, { cache: "no-store" }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (!response?.ok || !body) {
      setError(body?.error ?? "Usulan belum dapat dimuat.");
      return;
    }
    setProposal(body);
    setInclude(Object.fromEntries((body as Proposal).items.map((i) => [i.index, i.validation.state === "ok"])));
    setValues(Object.fromEntries((body as Proposal).items.map((i) => [i.index, Object.fromEntries(i.editable.map((k) => [k, i.params[k]]))])));
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (action: "confirm" | "reject") => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    const decisions = proposal.items.map((item) => ({
      index: item.index,
      include: include[item.index] === true,
      params: Object.fromEntries(Object.entries(values[item.index] ?? {}).filter(([, v]) => v !== undefined && v !== "")),
    }));
    const response = await fetch(`/api/agent/proposals/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "confirm" ? { sha256: proposal.sha256, decisions } : {}),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok || !body) {
      setError(body?.error ?? "Keputusan belum dapat diproses. Muat ulang usulan.");
      if (response?.status === 412 || response?.status === 409) void load();
      return;
    }
    setProposal(body);
    onDecided?.(body);
  };

  if (!proposal)
    return (
      <article className="rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-3 text-xs text-slate-600" data-proposal>
        <p className="font-semibold text-slate-900">{title ?? "Usulan tindakan"}</p>
        {error ? <p role="alert" className="mt-2 text-amber-800">{error}</p> : <p className="mt-2 flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Memuat usulan dari ERP…</p>}
      </article>
    );

  const pending = proposal.state === "pending";
  const selected = proposal.items.filter((i) => include[i.index]).length;
  return (
    <article className="rounded-xl border border-brand-200 bg-white p-3" data-proposal data-proposal-state={proposal.state}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-xs font-semibold text-slate-900">{proposal.title}</h4>
        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${pending ? "bg-brand-50 text-brand-700 ring-brand-200" : proposal.state === "applied" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-slate-100 text-slate-700 ring-slate-200"}`}>
          {STATE_LABEL[proposal.state]}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        {pending
          ? `Divalidasi ERP untuk akses Anda: ${proposal.counts.ok} siap · ${proposal.counts.warning} perlu dicek · ${proposal.counts.needs_input} perlu dilengkapi · ${proposal.counts.invalid} tidak dapat diterapkan`
          : `${proposal.receipts.applied} diterapkan · ${proposal.receipts.skipped} dilewati · ${proposal.receipts.failed} gagal${proposal.outcome && proposal.receipts.applied ? ` · ${proposal.outcome.resolved} sudah tuntas` : ""}`}
      </p>
      <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto overscroll-contain pr-1">
        {proposal.items.map((item) => {
          const v = VALIDATION[item.validation.state];
          const itemValues = values[item.index] ?? {};
          const disabled = !pending || busy || item.validation.state === "invalid";
          return (
            <li key={item.index} className="rounded-lg border border-slate-100 p-2" data-proposal-item={item.validation.state}>
              <div className="flex items-start gap-2">
                {pending ? (
                  <input
                    type="checkbox"
                    aria-label={`Sertakan: ${item.summary}`}
                    className="mt-0.5"
                    checked={include[item.index] === true}
                    disabled={disabled || !complete(item, itemValues)}
                    onChange={(e) => setInclude({ ...include, [item.index]: e.target.checked })}
                  />
                ) : item.receipt?.state === "applied" ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : item.receipt?.state === "failed" ? (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                ) : (
                  <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                )}
                <div className="min-w-0 flex-1 text-xs">
                  <p className="break-words text-slate-800">{item.summary}</p>
                  {pending ? (
                    <p className={`mt-0.5 text-[11px] font-medium ${v.className}`}>
                      {item.validation.state !== "ok" && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                      {v.label}
                      {item.validation.messages.length > 0 && <span className="font-normal text-slate-600"> — {item.validation.messages.join(" ")}</span>}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      {item.receipt?.message ?? "Tidak diproses."}
                      {item.outcome === "resolved" ? " · tuntas" : item.outcome === "open" ? " · masih terbuka" : ""}
                    </p>
                  )}
                  {pending && item.validation.state !== "invalid" && item.fields.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {item.fields.map((field) => (
                        <FieldInput
                          key={field.name}
                          field={field}
                          value={itemValues[field.name]}
                          disabled={disabled}
                          onChange={(value) => {
                            const next = { ...itemValues, [field.name]: value };
                            setValues({ ...values, [item.index]: next });
                            setInclude({ ...include, [item.index]: complete(item, next) });
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {item.href && (
                    <Link href={item.href} className="mt-1 inline-block text-[11px] font-semibold text-brand-600 hover:underline">
                      Buka di ERP →
                    </Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900">
          {error}
        </p>
      )}
      {pending ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5" /> Belum ada data berubah.
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void decide("reject")} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">
              Tolak
            </button>
            <button type="button" disabled={busy || selected === 0} onClick={() => void decide("confirm")} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Konfirmasi {selected} perubahan
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500">Tercatat di ERP dengan tanda terima per item dan log aktivitas atas nama Anda.</p>
      )}
    </article>
  );
}
