"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { updateOptyStatus } from "./actions";
import { Avatar } from "@/components/avatar";
import type { CardAccent } from "@/components/grid-card";

type KanbanTracker = {
  id: string;
  opty_no: string;
  client_name: string;
  sales_pic_name: string;
  position_name: string | null;
  opty_status_code: string;
  price_amount: number | null;
  price_period_code: string | null;
};

const COLUMNS = [
  { key: "cv_submission", label: "CV Submission" },
  { key: "solutioning", label: "Solutioning" },
  { key: "proposal_sent", label: "Proposal Sent" },
  { key: "need_action", label: "Need Action" },
  { key: "win", label: "Win" },
  { key: "dropped", label: "Dropped" },
] as const;

const COLUMN_ACCENT: Record<string, string> = {
  cv_submission: "linear-gradient(180deg,#7c3aed,#a78bfa)",
  solutioning: "linear-gradient(180deg,#2563eb,#60a5fa)",
  proposal_sent: "linear-gradient(180deg,#b45309,#fbbf24)",
  need_action: "linear-gradient(180deg,#ea580c,#fb923c)",
  win: "linear-gradient(180deg,#059669,#34d399)",
  dropped: "linear-gradient(180deg,#be123c,#fb7185)",
};

const PRICE_PERIOD_LABELS: Record<string, string> = { monthly: "/bulan", project: "/project", yearly: "/tahun", daily: "/hari" };

/**
 * Tampilan alternatif drag-drop buat Opportunity Tracker -- di samping tabel
 * dan grid yang sudah ada (tidak menggantikan atau mengubahnya sama sekali).
 * Drag antar kolom manggil updateOptyStatus yang sama persis dengan yang
 * dipakai OptyStatusSelector di tabel.
 */
export function OpportunityKanban({ data }: { data: KanbanTracker[] }) {
  const t = useTranslations("sales.opportunityTracker");
  const [items, setItems] = useState(data);
  useEffect(() => setItems(data), [data]);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
  }

  function handleDrop(e: React.DragEvent, statusCode: string) {
    e.preventDefault();
    setDragOverKey(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, opty_status_code: statusCode } : it)));
    startTransition(() => updateOptyStatus(id, statusCode));
  }

  return (
    <div className="overflow-x-auto p-4">
      <div className="flex gap-4 min-w-max">
        {COLUMNS.map((col) => {
          const colItems = items.filter((it) => it.opty_status_code === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); setDragOverKey(col.key); }}
              onDragLeave={() => setDragOverKey((c) => (c === col.key ? null : c))}
              onDrop={(e) => handleDrop(e, col.key)}
              className={`w-64 shrink-0 rounded-xl p-3 transition-colors ${dragOverKey === col.key ? "bg-violet-50 ring-2 ring-violet-200" : "bg-slate-50/70"}`}
            >
              <div className="flex items-center justify-between px-1 mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {col.label} <span className="text-slate-400 font-normal">({colItems.length})</span>
                </h3>
              </div>
              <div className="space-y-2 min-h-[40px]">
                {colItems.map((it) => (
                  <div
                    key={it.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, it.id)}
                    className="relative cursor-grab active:cursor-grabbing overflow-hidden rounded-xl border border-white/70 bg-white/90 backdrop-blur-xl pl-3.5 pr-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_16px_-10px_rgba(15,23,42,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_14px_24px_-10px_rgba(15,23,42,0.18)]"
                  >
                    <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundImage: COLUMN_ACCENT[it.opty_status_code] }} />
                    <Link href={`/sales/opportunity-tracker/${it.id}/edit`} className="block">
                      <p className="text-xs font-mono text-slate-400">{it.opty_no}</p>
                      <p className="text-sm font-semibold text-slate-900 mt-0.5">{it.client_name}</p>
                      {it.position_name && <p className="text-xs text-slate-500 mt-0.5">{it.position_name}</p>}
                      <div className="flex items-center justify-between mt-2.5">
                        <span className="text-xs font-medium text-slate-700">
                          {it.price_amount ? `Rp ${it.price_amount.toLocaleString("id-ID")}${PRICE_PERIOD_LABELS[it.price_period_code ?? ""] ?? ""}` : "-"}
                        </span>
                        <Avatar name={it.sales_pic_name} size="sm" />
                      </div>
                    </Link>
                  </div>
                ))}
                {colItems.length === 0 && <p className="text-xs text-slate-300 text-center py-6">{t("kanbanEmptyColumn")}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
