"use client";
// Edit history (QA 2026-10-08): a field's history from the table's "View edit history", the whole record's in the
// panel. Rows come from getFieldHistory (V1 Sales update actions record every changed field); values show as their
// labels where the page knows them.
import { useEffect, useState } from "react";
import { getFieldHistory } from "@/app/sales/history-actions";
import { useRowActions } from "./record-workspace";

type Row = Awaited<ReturnType<typeof getFieldHistory>>[number];
const when = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** A record's history (one field, or all with none), refetched when `version` changes (the record after a refresh). */
export function useHistory(recordId: string, field?: string, version?: unknown) {
  const { history } = useRowActions();
  const [state, setState] = useState<{ id: string; rows: Row[] | null; error: string | null }>({ id: "", rows: null, error: null });
  useEffect(() => {
    if (!recordId) return;
    let live = true;
    getFieldHistory(history.recordType, recordId, field)
      .then((rows) => live && setState({ id: recordId, rows, error: null }))
      .catch((err) => live && setState({ id: recordId, rows: null, error: (err as Error)?.message || "Gagal memuat riwayat" }));
    return () => { live = false; };
  }, [history.recordType, recordId, field, version]);
  // Another record (Previous / Next) shows "loading" until its own rows arrive, never the last record's.
  return state.id === recordId ? state : { rows: null, error: null };
}

/** The dialog's list: one field's history. */
export function HistoryList({ recordId, field }: { recordId: string; field?: string }) {
  return <HistoryRows state={useHistory(recordId, field)} showField={!field} />;
}

export function HistoryRows({ state: { rows, error }, showField }: { state: { rows: Row[] | null; error: string | null }; showField: boolean }) {
  const { history } = useRowActions();
  if (error) return <p className="text-[0.8125rem] text-red-600">{error}</p>;
  if (!rows) return <p className="text-[0.8125rem] text-slate-400">Memuat riwayat…</p>;
  if (!rows.length) return <p className="text-[0.8125rem] text-slate-400">Belum ada perubahan tercatat. Riwayat dicatat sejak 8 Okt 2026.</p>;
  return (
    <ol className="space-y-2" data-history>
      {rows.map((r) => (
        <li key={r.id} className="text-[0.8125rem] leading-5">
          {showField && <span className="font-medium text-slate-900">{history.label(r.field)}: </span>}
          <span className="text-slate-500 line-through decoration-slate-300">{history.format(r.field, r.old) || "kosong"}</span>
          <span className="text-slate-400"> → </span>
          <span className="text-slate-900">{history.format(r.field, r.new) || "kosong"}</span>
          <span className="block text-[0.6875rem] text-slate-500">{r.by} · {when(r.at)}</span>
        </li>
      ))}
    </ol>
  );
}
