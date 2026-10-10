"use client";
// Sales V2 Client Active: the shared record workspace (record-workspace.tsx) over TA applications, grouped by client as
// V1 was, with a board by the candidate's status at the client. The one write is V1's updateClientSubmissionStatus
// (status + note), so V1 (/ta/client-active) and V2 always show the same data. Parity list:
// docs/design/SALES-V2-TAB-MIGRATION.md §Client Active.
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Banknote, BriefcaseBusiness, Building2, CalendarClock, CircleDot, Hash, Layers, Mail, MessageCircle, NotebookPen, Phone, UserRound, Workflow,
} from "lucide-react";
import { Button, RecordPanel, SnackbarProvider, Textarea, type ContextMenuOption, type DataTableColumn, type TableToolbarColumn } from "@crisp-ui-kit/crisp";
import { useToast } from "@/components/toast-provider";
import { updateClientSubmissionStatus } from "@/app/ta/client-active/actions";
import { RecordLink, InlineSelect } from "./cells";
import type { HeaderSpec } from "./header-filter";
import { RecordTimeline } from "./history";
import { PanelTitle, RecordWorkspace, useRecordPanelRail, useRowActions, type Access, type PanelContext, type RowActions, type WorkspaceConfig } from "./record-workspace";
import { rupiah } from "./model";
import {
  CLIENT_BUILT_IN_VIEWS, CLIENT_DEFAULT_SHOWN, CLIENT_FIELD_KEYS, CLIENT_STATUSES, CLIENT_STATUS_LABEL, HIRING_STATUS_LABELS, NOT_SENT,
  clientFieldValue, clientMatchesSearch, clientStatusForm, type ClientCandidate,
} from "./client-active-model";

/** V1's action as a promise that throws its message, so the workspace shows it and rolls the change back. */
async function save(c: ClientCandidate, patch: { status?: string; note?: string | null }) {
  if ((patch.status ?? c.clientStatus) === NOT_SENT) throw new Error("Pilih status client dulu; status tidak bisa dikosongkan lagi.");
  const r = await updateClientSubmissionStatus(c.id, clientStatusForm(c, patch));
  if (!r.ok) throw new Error(r.error);
}

const STATUS_ORDER: Record<string, number> = Object.fromEntries(CLIENT_STATUSES.map((s, i) => [s.id, i]));
const SWATCH = Object.fromEntries(CLIENT_STATUSES.map((s) => [s.id, s.swatch])) as Record<string, 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12>;
const STATUS_OPTIONS = CLIENT_STATUSES.filter((s) => s.id !== NOT_SENT).map((s) => ({ value: s.id, label: s.title }));
const STATUS_CHIPS = CLIENT_STATUSES.filter((s) => s.id !== NOT_SENT).map((s) => ({ value: s.id, label: s.title, swatch: s.swatch }));
const price = (c: ClientCandidate) => (c.price ? rupiah(c.price) : "");
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

function sortValue(c: ClientCandidate, key: string): unknown {
  if (key === "clientStatus") return STATUS_ORDER[c.clientStatus] ?? 99;
  if (key === "price") return c.price ?? -1;
  return clientFieldValue(c, key);
}

function toolbarColumns(all: ClientCandidate[]): TableToolbarColumn[] {
  const uniq = (xs: (string | null)[]) => Array.from(new Set(xs.filter((v): v is string => !!v))).sort();
  return [
    { key: "client", label: "Client", type: "select", values: uniq(all.map((c) => c.client)) },
    { key: "name", label: "Kandidat", type: "text" },
    { key: "candidateNo", label: "Candidate No", type: "text" },
    { key: "position", label: "Posisi", type: "select", values: uniq(all.map((c) => c.position)) },
    { key: "level", label: "Level", type: "select", values: uniq(all.map((c) => c.level)) },
    { key: "clientStatus", label: "Status Client", type: "status", values: CLIENT_STATUSES.map((s) => s.title) },
    { key: "hiringStatus", label: "Hiring Status (TA)", type: "select", values: uniq(all.map((c) => HIRING_STATUS_LABELS[c.hiringStatus] ?? c.hiringStatus)) },
    { key: "sent", label: "Sudah dikirim ke client", type: "checkbox" },
    { key: "price", label: "Price", type: "number" },
    { key: "wa", label: "WA", type: "text" },
    { key: "email", label: "Email", type: "text" },
    { key: "clientNote", label: "Catatan client", type: "text" },
    { key: "clientUpdatedBy", label: "Diupdate oleh", type: "text" },
    { key: "clientUpdatedAt", label: "Diupdate", type: "date" },
  ];
}

type Props = { records: ClientCandidate[]; access: Access };

export function ClientActiveWorkspace(props: Props) {
  return (
    <SnackbarProvider>
      <RecordWorkspace
        config={CONFIG}
        records={props.records}
        access={props.access}
        headerEnd={<Link href="/ta/client-active" className="text-[0.75rem] text-slate-400 hover:text-slate-700 hover:underline" title="Tampilan lama (V1)">Versi lama</Link>}
        renderPanel={(p) => <ClientPanel ctx={p} access={props.access} />}
        renderMoveDialog={() => null}
      />
    </SnackbarProvider>
  );
}

// ── Summary cards: V1's four ────────────────────────────────────────────────────────────────────────────────
const KPIS: WorkspaceConfig<ClientCandidate>["kpis"] = [
  { id: "all", label: "Total Candidate", color: "navy", match: () => true },
  { id: "sent", label: "Terkirim ke client", color: "blue", match: (c) => c.clientStatus !== NOT_SENT },
  { id: "interview", label: "Client Interview", color: "orange", match: (c) => c.clientStatus === "client_interview" },
  { id: "accepted", label: "Client Accepted", color: "green", match: (c) => c.clientStatus === "client_accepted" },
];

function KanbanCard({ c, onOpen }: { c: ClientCandidate; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="block w-full space-y-1 text-left" data-card-preview={c.id}>
      <span className="block truncate text-[0.8125rem] font-semibold leading-5 text-slate-900">{c.name}</span>
      <span className="block truncate text-[0.75rem] text-slate-500">{c.client}</span>
      <span className="block truncate text-[0.75rem] text-slate-700">{[c.position, c.level].filter(Boolean).join(" · ") || "-"}</span>
      <span className="mt-1 flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5 text-[0.6875rem] text-slate-500">
        <span className="truncate">{HIRING_STATUS_LABELS[c.hiringStatus] ?? c.hiringStatus}</span>
        {price(c) && <span className="shrink-0 tabular-nums">{price(c)}</span>}
      </span>
    </button>
  );
}

// ── Table columns: V1's, the client first ─────────────────────────────────────────────────────────────────────
const SPECS: Record<string, HeaderSpec> = Object.fromEntries(([
  ["client", "Client", Building2, "values", "left"],
  ["candidateNo", "Candidate No", Hash, "text", "left"],
  ["name", "Kandidat", UserRound, "values", "left"],
  ["position", "Posisi", BriefcaseBusiness, "values", "left"],
  ["level", "Level", Layers, "values", "center"],
  ["wa", "WA", Phone, "text", "left"],
  ["email", "Email", Mail, "text", "left"],
  ["price", "Price", Banknote, "number", "right"],
  ["hiringStatus", "Hiring Status (TA)", Workflow, "values", "center"],
  ["clientStatus", "Status Client", CircleDot, "values", "center"],
  ["clientNote", "Catatan client", NotebookPen, "text", "left"],
  ["clientUpdatedBy", "Diupdate oleh", UserRound, "values", "left"],
  ["clientUpdatedAt", "Diupdate", CalendarClock, "date", "center"],
] as const).map(([key, label, icon, kind, align]) => [key, { key, label, icon, kind, align, sortable: true }]));

const text = (c: ClientCandidate, key: string) => String(clientFieldValue(c, key) ?? "");
const COLUMNS: Omit<DataTableColumn<ClientCandidate>, "header">[] = [
  { key: "client", accessor: (c) => c.client },
  { key: "candidateNo", accessor: (c) => c.candidateNo ?? "" },
  { key: "name", render: (_, c) => <RecordLink id={c.id}>{c.name}</RecordLink> },
  { key: "position", accessor: (c) => c.position ?? "" },
  { key: "level", accessor: (c) => c.level ?? "" },
  { key: "wa", accessor: (c) => c.wa ?? "" },
  { key: "email", accessor: (c) => c.email ?? "" },
  { key: "price", type: "number", accessor: (c) => c.price ?? 0, format: (_, c) => price(c) },
  { key: "hiringStatus", accessor: (c) => text(c, "hiringStatus") },
  { key: "clientStatus", type: "status", accessor: (c) => c.clientStatus, format: (_, c) => CLIENT_STATUS_LABEL[c.clientStatus] ?? c.clientStatus, swatches: SWATCH, editor: "select", options: STATUS_OPTIONS },
  { key: "clientNote", accessor: (c) => c.clientNote ?? "" },
  { key: "clientUpdatedBy", accessor: (c) => c.clientUpdatedBy ?? "" },
  { key: "clientUpdatedAt", accessor: (c) => day(c.clientUpdatedAt) },
];

function cellText(c: ClientCandidate, key: string): string {
  if (key === "price") return price(c);
  if (key === "clientUpdatedAt") return day(c.clientUpdatedAt);
  return text(c, key);
}

function rowMenu(c: ClientCandidate, { access, open }: RowActions): ContextMenuOption[] {
  const items: ContextMenuOption[] = [{ label: "Buka", onSelect: () => open(c.id) }];
  if (access.canEdit) items.push({ label: "Update status client", onSelect: () => open(c.id) });
  return items;
}

/** In-cell and panel edits: V1's action writes the status and the note together. */
const EDITS: WorkspaceConfig<ClientCandidate>["edits"] = {
  clientStatus: { field: "client_submission_status_code", required: true, patch: (_, v) => ({ clientStatus: v }), save: (c, v) => save(c, { status: v }) },
  clientNote: { field: "client_submission_note", patch: (_, v) => ({ clientNote: v.trim() || null }), save: (c, v) => save(c, { note: v.trim() || null }) },
};

const CONFIG: WorkspaceConfig<ClientCandidate> = {
  title: "Client Active",
  subtitle: "Kandidat TA per client dan statusnya di client: dikirim, review, interview, diterima.",
  noun: "kandidat",
  searchPlaceholder: "Cari kandidat, posisi, client, WA, email…",
  recordType: "client_submission",
  storage: { columns: "celerates.salesV2.clientActive.columns", views: "celerates.salesV2.clientActive.savedViews" },
  fieldKeys: CLIENT_FIELD_KEYS,
  fieldValue: clientFieldValue,
  sortValue,
  matchesSearch: clientMatchesSearch,
  toolbarColumns,
  builtInViews: CLIENT_BUILT_IN_VIEWS,
  kpis: KPIS,
  specs: SPECS,
  columns: COLUMNS,
  cellText,
  valueOrder: { clientStatus: CLIENT_STATUSES.map((s) => s.title) },
  defaultShown: CLIENT_DEFAULT_SHOWN,
  rowMenu,
  edits: EDITS,
  groupBy: (c) => c.client,
  grid: (c) => ({
    label: c.name,
    author: <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-slate-500"><span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: CLIENT_STATUSES.find((s) => s.id === c.clientStatus)?.accent }} />{CLIENT_STATUS_LABEL[c.clientStatus]}</span>,
    title: c.name,
    excerpt: [c.client, c.position, c.level].filter(Boolean).join(" · "),
    footer: <span className="text-[0.75rem] text-slate-500">{HIRING_STATUS_LABELS[c.hiringStatus] ?? c.hiringStatus}{price(c) ? ` · ${price(c)}` : ""}</span>,
    date: day(c.clientUpdatedAt) || undefined,
  }),
  // Board by status at the client; a move is V1's action with the note unchanged. "Belum dikirim" only holds
  // candidates never sent: V1 has no way to clear a status, so nothing moves back into it.
  board: {
    stages: CLIENT_STATUSES,
    stageOf: (c) => c.clientStatus,
    withStage: (_, to) => ({ clientStatus: to }),
    move: (c, to) => save(c, { status: to }),
    confirm: new Set(),
    recordLabel: (c) => c.name,
    cardLabel: (c) => c.name,
    renderCard: (c, open) => <KanbanCard c={c} onOpen={open} />,
  },
};

// ── Record panel ──────────────────────────────────────────────────────────────────────────────────────────────
function ClientPanel({ ctx, access }: { ctx: PanelContext<ClientCandidate>; access: Access }) {
  const { record, records, select, close } = ctx;
  const { edit, showHistory } = useRowActions();
  const { showToast } = useToast();
  const [note, setNote] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const wrapRef = useRecordPanelRail(record ? { type: "client_submission", id: record.id, label: record.name } : null, close, false);
  if (!record) return <div ref={wrapRef} hidden />;
  const index = records.findIndex((r) => r.id === record.id);
  const fail = (err: unknown) => showToast((err as Error)?.message || "Gagal menyimpan", "error");
  const draft = note ?? record.clientNote ?? "";

  const highlights = [
    {
      key: "clientStatus", label: "Status Client",
      value: <InlineSelect value={record.clientStatus === NOT_SENT ? "" : record.clientStatus} options={STATUS_CHIPS} label="Status Client" canEdit={access.canEdit} onChange={(v) => edit(record.id, "clientStatus", v).catch(fail)} />,
    },
    { key: "client", label: "Client", value: record.client },
    { key: "position", label: "Posisi", value: [record.position, record.level].filter(Boolean).join(" · ") || "-" },
    { key: "hiring", label: "Hiring Status (TA)", value: HIRING_STATUS_LABELS[record.hiringStatus] ?? record.hiringStatus },
    { key: "price", label: "Price", value: price(record) || "-" },
    { key: "no", label: "Candidate No", value: record.candidateNo ?? "-" },
    { key: "updated", label: "Diupdate", value: record.clientUpdatedBy ? `${record.clientUpdatedBy} · ${day(record.clientUpdatedAt)}` : "-" },
  ];
  const sections = [
    {
      key: "note", label: "Catatan client", count: record.clientNote ? 1 : 0,
      content: access.canEdit ? (
        <div className="space-y-2">
          <Textarea value={draft} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Catatan dari client (feedback interview, alasan, dsb.)" aria-label="Catatan client" />
          <Button size="sm" intent="neutral" disabled={saving || draft === (record.clientNote ?? "") || record.clientStatus === NOT_SENT}
            onClick={() => start(async () => { try { await edit(record.id, "clientNote", draft); setNote(null); } catch (e) { fail(e); } })}>
            Simpan catatan
          </Button>
          {record.clientStatus === NOT_SENT && <p className="text-[0.75rem] text-slate-500">Pilih status client dulu, lalu catatan bisa disimpan.</p>}
        </div>
      ) : record.clientNote ? <p className="whitespace-pre-wrap text-[0.8125rem] text-slate-700">{record.clientNote}</p> : undefined,
    },
    {
      key: "contact", label: "Kontak kandidat", count: [record.wa, record.email].filter(Boolean).length,
      content: (record.wa || record.email) ? (
        <ul className="space-y-1 text-[0.8125rem] text-slate-700">
          {record.wa && <li className="flex items-center gap-2"><MessageCircle size={13} className="text-slate-400" /> {record.wa}</li>}
          {record.email && <li className="flex items-center gap-2"><Mail size={13} className="text-slate-400" /> {record.email}</li>}
        </ul>
      ) : undefined,
    },
  ];
  const footer = access.canEdit ? (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/ta/pipeline" className="text-[0.75rem] text-slate-500 hover:text-slate-800 hover:underline">Buka Hiring Pipeline (TA)</Link>
    </div>
  ) : (
    <p className="text-[0.75rem] text-slate-500">Mode lihat saja: update status butuh akses Editor Sales atau TA.</p>
  );

  return (
    <>
      <div ref={wrapRef} hidden />
      <RecordPanel
        record={{ id: record.id, name: record.name } as never}
        title={<PanelTitle name={record.name} prefill={`Tentang kandidat ${record.name} di ${record.client}: `} />}
        counterLabel={index >= 0 ? `${index + 1} dari ${records.length}` : undefined}
        onPrevious={index > 0 ? () => { setNote(null); select(records[index - 1].id); } : undefined}
        onNext={index >= 0 && index < records.length - 1 ? () => { setNote(null); select(records[index + 1].id); } : undefined}
        previousRecordLabel="Sebelumnya"
        nextRecordLabel="Berikutnya"
        closeLabel="Tutup"
        highlightsLabel="Ringkasan"
        highlights={highlights}
        activityLabel="Aktivitas"
        activity={<RecordTimeline recordId={record.id} version={record} empty="Belum ada perubahan status client yang tercatat." />}
        viewAllActivityLabel="Riwayat lengkap"
        onViewAllActivity={() => showHistory(record.id)}
        sections={sections}
        footer={footer}
        resizable
        defaultWidth={420}
        minWidth={360}
        maxWidth={720}
        onClose={close}
        data-testid="sales-v2-record-panel"
      />
    </>
  );
}
