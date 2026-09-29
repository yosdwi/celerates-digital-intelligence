"use client";
import { useState } from "react";
import Link from "next/link";
import { Pill, type PillVariant } from "@/components/pill";

const STATUS_VARIANT: Record<string, PillVariant> = { pending: "neutral", approved: "success", rejected: "critical", cancelled: "neutral" };
const STATUS_LABEL: Record<string, string> = { pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" };

export type RequestRow = { id: string; leave_type_name: string | null; start_date: string; end_date: string; status_code: string; requester_name?: string | null };

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(dateStr + "T00:00:00"));
}

function RequestList({ rows, showRequester }: { rows: RequestRow[]; showRequester?: boolean }) {
  if (rows.length === 0) return <p className="text-center text-sm text-slate-400 py-8">Belum ada data.</p>;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Link key={r.id} href={`/attendance/time-off/${r.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50 transition-colors">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">{r.leave_type_name ?? "-"}</p>
            <Pill variant={STATUS_VARIANT[r.status_code]}>{STATUS_LABEL[r.status_code]}</Pill>
          </div>
          {showRequester && <p className="text-xs text-slate-500 mt-1">{r.requester_name ?? "-"}</p>}
          <p className="text-xs text-slate-400 mt-1">{formatDate(r.start_date)} - {formatDate(r.end_date)}</p>
        </Link>
      ))}
    </div>
  );
}

export function TimeOffTabs({ myRequests, approvals }: { myRequests: RequestRow[]; approvals: RequestRow[] }) {
  const [tab, setTab] = useState<"mine" | "approvals">("mine");

  return (
    <div>
      <div className="flex border-b border-slate-200 mb-4">
        <button
          onClick={() => setTab("mine")}
          className={`flex-1 pb-3 text-sm font-medium border-b-2 transition-colors ${tab === "mine" ? "border-brand-600 text-brand-600" : "border-transparent text-slate-400"}`}
        >
          My Requests
        </button>
        <button
          onClick={() => setTab("approvals")}
          className={`flex-1 pb-3 text-sm font-medium border-b-2 transition-colors relative ${tab === "approvals" ? "border-brand-600 text-brand-600" : "border-transparent text-slate-400"}`}
        >
          Approvals
          {approvals.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center h-4 w-4 rounded-full bg-rose-500 text-[10px] text-white">{approvals.length}</span>
          )}
        </button>
      </div>
      {tab === "mine" ? <RequestList rows={myRequests} /> : <RequestList rows={approvals} showRequester />}
    </div>
  );
}
