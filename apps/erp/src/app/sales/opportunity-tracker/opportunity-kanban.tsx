"use client";
import { useEffect, useRef, useState, useTransition } from "react";
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
const SCROLL_KEY = "sales-kanban-scroll";

export function OpportunityKanban({ data, canEdit }: { data: KanbanTracker[]; canEdit: boolean }) {
  const t = useTranslations("sales.opportunityTracker");
  const [items, setItems] = useState(data);
  useEffect(() => setItems(data), [data]);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const boardRef = useRef<HTMLDivElement>(null);

  // Opening a card leaves this page; remember where the user was (board offset + each column) so Back
  // lands in the same place instead of the top of a fresh board (SALES-UX-002).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? "null") as { left: number; tops: number[] } | null;
      sessionStorage.removeItem(SCROLL_KEY);
      const board = boardRef.current;
      if (!saved || !board) return;
      board.scrollLeft = saved.left;
      board.querySelectorAll<HTMLElement>("[data-kanban-list]").forEach((el, i) => { el.scrollTop = saved.tops[i] ?? 0; });
    } catch { /* storage unavailable: start at the top */ }
  }, []);

  function rememberScroll(e: React.MouseEvent) {
    if (!(e.target as HTMLElement).closest("a")) return;
    const board = boardRef.current;
    if (!board) return;
    try {
      const tops = [...board.querySelectorAll<HTMLElement>("[data-kanban-list]")].map((el) => el.scrollTop);
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ left: board.scrollLeft, tops }));
    } catch { /* ignore */ }
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
  }

  function handleDrop(e: React.DragEvent, statusCode: string) {
    e.preventDefault();
    if (!canEdit) return;
    setDragOverKey(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, opty_status_code: statusCode } : it)));
    startTransition(() => updateOptyStatus(id, statusCode));
  }

  return (
    // The board owns both scrollbars and has a bounded height, so the horizontal scrollbar sits at the bottom of
    // what is on screen and each column scrolls on its own with its header pinned (SALES-UX-001).
    <div ref={boardRef} onClickCapture={rememberScroll} data-kanban-board className="overflow-x-auto overflow-y-hidden p-4 h-[calc(100dvh-10rem)] min-h-[420px]">
      <div className="flex gap-4 min-w-max h-full">
        {COLUMNS.map((col) => {
          const colItems = items.filter((it) => it.opty_status_code === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragOverKey(col.key); } }}
              onDragLeave={() => canEdit && setDragOverKey((c) => (c === col.key ? null : c))}
              onDrop={(e) => handleDrop(e, col.key)}
              className={`w-64 shrink-0 h-full flex flex-col rounded-xl p-3 transition-colors ${dragOverKey === col.key ? "bg-violet-50 ring-2 ring-violet-200" : "bg-slate-50/70"}`}
            >
              <div className="flex items-center justify-between px-1 mb-3 shrink-0">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {col.label} <span className="text-slate-400 font-normal">({colItems.length})</span>
                </h3>
              </div>
              <div data-kanban-list className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1">
                {colItems.map((it) => (
                  <div
                    key={it.id}
                    draggable={canEdit}
                    onDragStart={(e) => canEdit && handleDragStart(e, it.id)}
                    className={`relative ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-default"} overflow-hidden rounded-xl border border-white/70 bg-white/90 backdrop-blur-xl pl-3.5 pr-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_16px_-10px_rgba(15,23,42,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_14px_24px_-10px_rgba(15,23,42,0.18)]`}
                  >
                    <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundImage: COLUMN_ACCENT[it.opty_status_code] }} />
                    {canEdit ? (
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
                    ) : (
                      <div>
                        <p className="text-xs font-mono text-slate-400">{it.opty_no}</p>
                        <p className="text-sm font-semibold text-slate-900 mt-0.5">{it.client_name}</p>
                        {it.position_name && <p className="text-xs text-slate-500 mt-0.5">{it.position_name}</p>}
                        <div className="flex items-center justify-between mt-2.5">
                          <span className="text-xs font-medium text-slate-700">
                            {it.price_amount ? `Rp ${it.price_amount.toLocaleString("id-ID")}${PRICE_PERIOD_LABELS[it.price_period_code ?? ""] ?? ""}` : "-"}
                          </span>
                          <Avatar name={it.sales_pic_name} size="sm" />
                        </div>
                      </div>
                    )}
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
