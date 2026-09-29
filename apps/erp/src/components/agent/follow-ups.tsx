"use client";
// `Tindak lanjut berjalan`: the user's recent Agent proposals with the live outcome of what was applied
// (signal → act → outcome). Outcomes are computed by ERP from current records, not remembered by the Agent.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CheckCircle2, Clock3, ListChecks } from "lucide-react";
import { STATE_LABEL, type Proposal } from "./proposal";

const ProposalCard = dynamic(() => import("./proposal").then((m) => m.ProposalCard), { ssr: false });
type Row = Omit<Proposal, "items"> & { created_at: string };

export function FollowUps({ refresh }: { refresh: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/agent/proposals", { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((body) => !controller.signal.aborted && setRows(body.items ?? []))
      .catch(() => undefined);
    return () => controller.abort();
  }, [refresh, reload]);
  const visible = rows.filter((r) => r.state !== "rejected" && r.state !== "expired");
  if (!visible.length) return null;
  return (
    <section className="space-y-2" aria-labelledby="agent-follow-ups" data-agent-follow-ups>
      <h3 id="agent-follow-ups" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <ListChecks className="h-3.5 w-3.5" /> Tindak lanjut berjalan
      </h3>
      {visible.map((row) => {
        const applied = row.receipts.applied;
        const resolved = row.outcome?.resolved ?? 0;
        return (
          <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-3 text-xs" data-follow-up={row.state}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-slate-900">{row.title}</p>
              {row.state === "pending" ? <Clock3 className="h-4 w-4 shrink-0 text-brand-600" /> : resolved === applied && applied > 0 ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : null}
            </div>
            <p className="mt-1 text-slate-500">
              {row.state === "pending"
                ? `${STATE_LABEL.pending} · ${row.counts.ok + row.counts.warning + row.counts.needs_input} item`
                : `${STATE_LABEL[row.state]} · ${applied} diterapkan · ${resolved} dari ${applied} tuntas`}
            </p>
            {row.state === "pending" && (
              <div className="mt-2">
                {open === row.id ? (
                  <ProposalCard id={row.id} onDecided={() => setReload((n) => n + 1)} />
                ) : (
                  <button type="button" onClick={() => setOpen(row.id)} className="font-semibold text-brand-600 hover:underline">
                    Tinjau usulan →
                  </button>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
