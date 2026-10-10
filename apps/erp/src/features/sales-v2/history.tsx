"use client";
// Edit history (QA 2026-10-08), three ways in: a field's from the table's "View edit history", a record's as the panel's
// Aktivitas timeline, the module's in the page's Riwayat drawer. Rows come from getFieldHistory / getModuleHistory
// (V1 Sales update actions record every changed field); values show as their labels where the page knows them. One
// save is one entry: its fields share the save's time, so consecutive rows of one record, person and time group.
import { Fragment, useEffect, useState } from "react";
import { ActivityFeed, ActivityFeedDiffItem, ActivityFeedDiffList, ActivityFeedRow, Button, Drawer, DrawerBody, Select } from "@crisp-ui-kit/crisp";
import { getFieldHistory, getModuleHistory } from "@/app/sales/history-actions";
import { useRowActions } from "./record-workspace";

type Row = Awaited<ReturnType<typeof getFieldHistory>>[number];
export const when = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const SINCE_ENTRIES = "Riwayat dicatat sejak 8 Okt 2026.";

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

type Group = { key: string; recordId: string; by: string; at: string; rows: Row[] };
function group(rows: Row[]): Group[] {
  const out: Group[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.recordId === r.recordId && last.by === r.by && last.at === r.at) last.rows.push(r);
    else out.push({ key: r.id, recordId: r.recordId, by: r.by, at: r.at, rows: [r] });
  }
  return out;
}

/** One save: who, what (or which record, in the module feed), when, and each field's before → after. */
function ChangeRow({ g, subject, showField = true }: { g: Group; subject?: React.ReactNode; showField?: boolean }) {
  const { history } = useRowActions();
  return (
    <ActivityFeedRow
      actor={<span className="font-medium text-slate-900">{g.by}</span>}
      action={subject ?? <span className="text-slate-500">mengubah</span>}
      when={when(g.at)}
    >
      <ActivityFeedDiffList>
        {g.rows.map((r) => (
          <ActivityFeedDiffItem
            key={r.id}
            field={showField ? `${history.label(r.field)}:` : ""}
            before={<span className="line-through decoration-slate-300">{history.format(r.field, r.old) || "kosong"}</span>}
            after={history.format(r.field, r.new) || "kosong"}
          />
        ))}
      </ActivityFeedDiffList>
    </ActivityFeedRow>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-[0.8125rem] text-slate-400">{children}</p>;

/** The cell dialog's list: one field's history. */
export function HistoryList({ recordId, field }: { recordId: string; field?: string }) {
  const { rows, error } = useHistory(recordId, field);
  if (error) return <p className="text-[0.8125rem] text-red-600">{error}</p>;
  if (!rows) return <Muted>Memuat riwayat…</Muted>;
  if (!rows.length) return <Muted>Belum ada perubahan tercatat. {SINCE_ENTRIES}</Muted>;
  return <ActivityFeed data-history>{group(rows).map((g) => <ChangeRow key={g.key} g={g} showField={!field} />)}</ActivityFeed>;
}

/** Something else on the record's timeline (Account: a logged call, email, meeting or note), placed by its time. */
export type TimelineItem = { key: string; at: string; row: React.ReactNode };

/**
 * The panel's Aktivitas (Attio's record timeline): the record's saves, newest first, with the page's own entries
 * mixed in by time. The latest ten, then the rest on request.
 */
export function RecordTimeline({ recordId, version, extra = [], empty = "Belum ada aktivitas." }: { recordId: string; version: unknown; extra?: TimelineItem[]; empty?: string }) {
  const { rows, error } = useHistory(recordId, undefined, version);
  const [all, setAll] = useState(false);
  useEffect(() => setAll(false), [recordId]);
  const items = [...group(rows ?? []).map((g): TimelineItem => ({ key: g.key, at: g.at, row: <ChangeRow g={g} /> })), ...extra]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const shown = all ? items : items.slice(0, 10);
  return (
    <div className="space-y-2" data-record-timeline>
      {error && <p className="text-[0.8125rem] text-red-600">{error}</p>}
      {!rows && !error && !extra.length && <Muted>Memuat aktivitas…</Muted>}
      {rows && !items.length && <Muted>{empty} {SINCE_ENTRIES}</Muted>}
      {shown.length > 0 && <ActivityFeed>{shown.map((i) => <Fragment key={i.key}>{i.row}</Fragment>)}</ActivityFeed>}
      {items.length > shown.length && <Button size="sm" intent="ghost" onClick={() => setAll(true)}>Tampilkan {items.length - shown.length} lainnya</Button>}
    </div>
  );
}

const SINCE = [
  { value: "", label: "Semua waktu" },
  { value: "1", label: "24 jam terakhir" },
  { value: "7", label: "7 hari terakhir" },
  { value: "30", label: "30 hari terakhir" },
];
type Feed = Awaited<ReturnType<typeof getModuleHistory>>;

/**
 * The page's Riwayat drawer: every change in the module, newest first, filtered by person, field and time (and by one
 * record when opened from its panel). An entry's record name opens that record.
 */
export function ModuleHistoryDrawer({ open, recordId, onClose, onClearRecord, labelOf, onOpenRecord }: {
  open: boolean;
  /** Only this record's changes (from the panel's "Riwayat lengkap"). */
  recordId?: string | null;
  onClose: () => void;
  onClearRecord: () => void;
  /** The record's name as the page shows it; null once it is gone. */
  labelOf: (id: string) => string | null;
  onOpenRecord: (id: string) => void;
}) {
  const { history } = useRowActions();
  const [actor, setActor] = useState("");
  const [field, setField] = useState("");
  const [days, setDays] = useState("7");
  const [feed, setFeed] = useState<{ rows: Row[]; more: boolean; facets: Feed["facets"] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = (offset: number) => {
    setLoading(true);
    const since = days ? new Date(Date.now() - Number(days) * 86_400_000).toISOString() : undefined;
    return getModuleHistory(history.recordType, { recordId: recordId ?? undefined, actor: actor || undefined, field: field || undefined, since, offset })
      .then((r) => {
        setError(null);
        setFeed((prev) => {
          if (!offset || !prev) return { rows: r.rows, more: r.more, facets: r.facets };
          const seen = new Set(prev.rows.map((x) => x.id));
          return { rows: [...prev.rows, ...r.rows.filter((x) => !seen.has(x.id))], more: r.more, facets: prev.facets };
        });
      })
      .catch((err) => setError((err as Error)?.message || "Gagal memuat riwayat"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (!open) return;
    setFeed(null);
    load(0);
  }, [open, recordId, actor, field, days]); // eslint-disable-line react-hooks/exhaustive-deps

  const facets = feed?.facets;
  const recordName = recordId ? labelOf(recordId) ?? "Record terhapus" : null;
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} title="Riwayat perubahan" closeLabel="Tutup" data-sales-v2-history-drawer>
      <DrawerBody>
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Select aria-label="Orang" size="small" value={actor} onValueChange={setActor} options={[{ value: "", label: "Semua orang" }, ...(facets?.actors ?? (actor ? [actor] : [])).map((a) => ({ value: a, label: a }))]} />
          <Select aria-label="Field" size="small" value={field} onValueChange={setField} options={[{ value: "", label: "Semua field" }, ...(facets?.fields ?? (field ? [field] : [])).map((f) => ({ value: f, label: history.label(f) }))]} />
          <Select aria-label="Waktu" size="small" value={days} onValueChange={setDays} options={SINCE} />
        </div>
        {recordName && (
          <p className="mb-3 flex items-center gap-2 text-[0.8125rem] text-slate-600">
            Hanya <span className="font-medium text-slate-900">{recordName}</span>
            <Button size="sm" intent="ghost" onClick={onClearRecord}>Tampilkan semua record</Button>
          </p>
        )}
        {error && <p className="text-[0.8125rem] text-red-600">{error}</p>}
        {!feed && !error && <Muted>Memuat riwayat…</Muted>}
        {feed && !feed.rows.length && <Muted>Tidak ada perubahan untuk filter ini. {SINCE_ENTRIES}</Muted>}
        {feed && feed.rows.length > 0 && (
          <ActivityFeed>
            {group(feed.rows).map((g) => {
              const name = labelOf(g.recordId);
              const subject = name
                ? <button type="button" className="truncate font-medium text-brand-700 hover:underline" onClick={() => onOpenRecord(g.recordId)}>{name}</button>
                : <span className="text-slate-400">Record terhapus</span>;
              return <ChangeRow key={g.key} g={g} subject={recordId ? undefined : subject} />;
            })}
          </ActivityFeed>
        )}
        {feed?.more && (
          <div className="mt-3 flex justify-center">
            <Button size="sm" intent="neutral" disabled={loading} onClick={() => load(feed.rows.length)}>{loading ? "Memuat…" : "Muat lagi"}</Button>
          </div>
        )}
      </DrawerBody>
    </Drawer>
  );
}
