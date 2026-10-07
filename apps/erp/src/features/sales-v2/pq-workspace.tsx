"use client";
// Sales V2 PQ Tracker: the shared record workspace (record-workspace.tsx) configured with V1 PQ Tracker fields, its
// Pipeline Stage board and its actions. docs/design/SALES-V2-CRISP-UX-CONTRACT.md §14.
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Banknote, Briefcase, Building2, CalendarCheck, CalendarClock, CalendarRange, CircleDot, FileSignature, FileText, FolderKanban, Gauge,
  Hash, Layers, ListChecks, Megaphone, NotebookPen, Paperclip, Receipt, Signal, Tag, Timer, UserRound, Users, Flag, Network,
} from "lucide-react";
import { Button, Dialog, DialogFooter, SnackbarProvider, type DataTableColumn, type TableToolbarColumn } from "@crisp-ui-kit/crisp";
import { OPTY_STATUS, STAGE_TO_OPTY_STATUS } from "@/app/sales/pq-constants";
import { useToast } from "@/components/toast-provider";
import type { HeaderSpec } from "./header-filter";
import { SheetSyncButton, PQ_SHEET_SYNC } from "./sheet-sync-dialog";
import type { SheetSyncData } from "./data";
import { RecordWorkspace, type Access, type MoveContext, type WorkspaceConfig } from "./record-workspace";
import { BUSINESS_UNITS, CLIENT_TYPES, LEVELS, PRIORITIES, SERVICE_TYPES, rupiah } from "./model";
import {
  LEAD_SOURCE_LABEL, OPTY_STATUS_LABEL, PQ_BUILT_IN_VIEWS, PQ_DEFAULT_SHOWN, PQ_FIELD_KEYS, PQ_STAGES, PQ_STAGE_LABEL, SIGNATURE_LABEL,
  needsPqNo, pqFieldValue, pqMatchesSearch, withPqStage, type Pq,
} from "./pq-model";
import { CreatePq, type PqCreateRequest } from "./pq-forms";
import { FileLinks, PqPreview, ok, savePqStage } from "./pq-preview";
import { updateOptyStatus, updatePipelineStage } from "@/app/sales/actions";
import type { PqOptions } from "./pq-data";

const STAGE_ORDER: Record<string, number> = Object.fromEntries(PQ_STAGES.map((s, i) => [s.id, i]));
const STAGE_SWATCH = Object.fromEntries(PQ_STAGES.map((s, i) => [String(i), s.swatch])) as Record<string, 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12>;
// Win and Drop close the PQ (Win also tells TM to start talent assignment), so they ask first.
const CONFIRM = new Set(["win", "drop"]);

function sortValue(p: Pq, key: string): unknown {
  if (key === "stage") return STAGE_ORDER[p.stage] ?? 99;
  return pqFieldValue(p, key);
}

function toolbarColumns(all: Pq[]): TableToolbarColumn[] {
  const salesPics = Array.from(new Set(all.map((r) => r.salesPic).filter(Boolean))).sort();
  return [
    { key: "client", label: "Client", type: "text" },
    { key: "optyNo", label: "Opty No", type: "text" },
    { key: "pqNo", label: "PQ No", type: "text" },
    { key: "stage", label: "Pipeline Stage", type: "status", values: PQ_STAGES.map((s) => s.title) },
    { key: "optyStatus", label: "Opty Status", type: "select", values: OPTY_STATUS.map(([, l]) => l) },
    { key: "signature", label: "TTD PQ", type: "select", values: Object.values(SIGNATURE_LABEL) },
    { key: "needPq", label: "Perlu Generate PQ", type: "checkbox" },
    { key: "project", label: "Project", type: "text" },
    { key: "position", label: "Positions", type: "text" },
    { key: "clientType", label: "Client Type", type: "select", values: CLIENT_TYPES.map(([, l]) => l) },
    { key: "serviceType", label: "Service Type", type: "select", values: SERVICE_TYPES.map(([, l]) => l) },
    { key: "businessUnit", label: "Business Unit", type: "select", values: BUSINESS_UNITS.map(([, l]) => l) },
    { key: "level", label: "Level", type: "select", values: LEVELS.map(([, l]) => l) },
    { key: "priority", label: "Priority", type: "select", values: PRIORITIES.map(([, l]) => l) },
    { key: "headcount", label: "Headcount", type: "number" },
    { key: "durationMonths", label: "Durasi (bulan)", type: "number" },
    { key: "bant", label: "BANTE", type: "number" },
    { key: "price", label: "Price", type: "number" },
    { key: "salesPic", label: "Sales PIC", type: "select", values: salesPics },
    { key: "leadSource", label: "Lead Source", type: "select", values: Object.values(LEAD_SOURCE_LABEL) },
    { key: "requestDate", label: "Opty Request Date", type: "date" },
    { key: "approvalDate", label: "Approval Date", type: "date" },
    { key: "startDate", label: "Start Date", type: "date" },
    { key: "endDate", label: "End Date", type: "date" },
    { key: "createdAt", label: "Dibuat", type: "date" },
    { key: "notes", label: "Notes", type: "text" },
  ];
}

type Props = { records: Pq[]; access: Access; options: PqOptions; sheetSync: SheetSyncData | null };

export function PqWorkspace(props: Props) {
  return (
    <SnackbarProvider>
      <Workspace {...props} />
    </SnackbarProvider>
  );
}

function Workspace({ records, access, options, sheetSync }: Props) {
  const [create, setCreate] = useState<PqCreateRequest>(null);
  return (
    <RecordWorkspace
      config={CONFIG}
      records={records}
      access={access}
      onNewCard={(stage) => setCreate({ stage })}
      headerEnd={<Link href="/sales" className="text-[12px] text-slate-400 hover:text-slate-700 hover:underline" title="Tampilan lama (V1)">Versi lama</Link>}
      toolbarEnd={
        <>
          {sheetSync && <SheetSyncButton data={sheetSync} parts={PQ_SHEET_SYNC} />}
          {access.canEdit && <CreatePq options={options} create={create} onCreate={setCreate} returnPath="/sales/v2/pq-tracker" />}
        </>
      }
      renderPanel={(p) => (
        <PqPreview record={p.record} records={p.records} access={access} returnTo={p.returnTo} onSelect={p.select} onClose={p.close} onPatch={p.patch} options={options} />
      )}
      renderMoveDialog={(m) => <MoveDialog {...m} />}
    />
  );
}

/** Win / Drop from the board: say what V1 does with it (Opty Status follows; Win notifies TM), then save. */
function MoveDialog({ move, onCancel, onMoved }: MoveContext<Pq>) {
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const r = move?.record;
  const to = move?.to ?? "";
  const status = STAGE_TO_OPTY_STATUS[to];
  return (
    <Dialog
      open={!!move}
      onOpenChange={(o) => !o && !pending && onCancel()}
      title={`Pindahkan ke ${PQ_STAGE_LABEL[to] ?? to}?`}
      description={r ? `${r.client} · ${r.pqNo ?? r.optyNo}: ${PQ_STAGE_LABEL[r.stage] ?? r.stage} → ${PQ_STAGE_LABEL[to] ?? to}. Opty Status ikut jadi ${status ? OPTY_STATUS_LABEL[status] : "-"}${to === "win" ? "; TM diberi tahu untuk talent assignment" : ""}.` : undefined}
      width={460}
      data-sales-v2-dialog="move"
    >
      <DialogFooter>
        <Button size="sm" intent="neutral" onClick={onCancel} disabled={pending}>Batal</Button>
        <Button size="sm" intent={to === "drop" ? "danger" : "primary"} loading={pending} onClick={() => r && start(async () => {
          try { await savePqStage(r.id, to); onMoved(); }
          catch (err) { showToast((err as Error)?.message || "Gagal memindahkan", "error"); }
        })}>Pindahkan</Button>
      </DialogFooter>
    </Dialog>
  );
}

// ── Summary cards: built-in views, in the ERP palette ───────────────────────────────────────────────────────
const KPIS: WorkspaceConfig<Pq>["kpis"] = [
  { id: "all", label: "Total PQ", tone: "#194667", soft: "#eef3f7", bar: "#194667", match: () => true },
  { id: "on_going", label: "On Going", tone: "#1a43b8", soft: "#e8eefd", bar: "#2356e8", match: (p) => p.stage === "on_going" },
  { id: "need_pq", label: "Perlu Generate PQ", tone: "#b2410f", soft: "#fdeee7", bar: "#f15525", match: needsPqNo },
  { id: "win", label: "Win", tone: "#0e6b52", soft: "#e1f4ee", bar: "#10b981", match: (p) => p.stage === "win" },
  { id: "drop", label: "Drop", tone: "#b42318", soft: "#fdecea", bar: "#ef4444", match: (p) => p.stage === "drop" },
];

const initials = (name: string) => name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
const SIGN_CHIP: Record<string, string> = { pending: "bg-amber-50 text-amber-700", signed: "bg-emerald-50 text-emerald-700", rejected: "bg-red-50 text-red-700" };

function KanbanCard({ p, onOpen }: { p: Pq; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="block w-full space-y-1 text-left" data-card-preview={p.id}>
      <span className="block truncate text-[13px] font-semibold leading-5 text-slate-900">{p.client}</span>
      <span className="block truncate font-mono text-[11px] text-slate-500">{p.pqNo ?? p.optyNo}</span>
      <span className="block truncate text-[12px] text-slate-700">{[p.project, p.position, p.headcount ? `${p.headcount} HC` : null].filter(Boolean).join(" · ")}</span>
      {p.price != null && <span className="block text-[13px] font-semibold tabular-nums text-slate-900">{rupiah(p.price, p.pricePeriod)}</span>}
      <span className="mt-1 flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5 text-[11px] text-slate-500">
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dce8ef] text-[10px] font-semibold text-[#123650]">{initials(p.salesPic)}</span>
          <span className="truncate">{p.salesPic}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {needsPqNo(p) && <span className="rounded bg-[#fdeee7] px-1 font-semibold text-[#b2410f]">PQ No</span>}
          {SIGN_CHIP[p.signature.status] && <span className={`rounded px-1 font-semibold ${SIGN_CHIP[p.signature.status]}`}>TTD</span>}
          {p.priority && <span className="font-semibold uppercase text-slate-600">{p.priority}</span>}
        </span>
      </span>
    </button>
  );
}

// ── Table columns: every V1 column, Client first and pinned ─────────────────────────────────────────────────
const SPECS: Record<string, HeaderSpec> = Object.fromEntries(([
  ["client", "Client", Building2, "values", "left"],
  ["optyNo", "Opty No", Hash, "text", "left"],
  ["pqNo", "PQ No", Receipt, "text", "left"],
  ["stage", "Pipeline Stage", CircleDot, "values", "center"],
  ["optyStatus", "Opty Status", ListChecks, "values", "left"],
  ["signature", "TTD PQ", FileSignature, "values", "center"],
  ["pqDocs", "Dokumen PQ", Paperclip, "none", "left"],
  ["project", "Project", FolderKanban, "text", "left"],
  ["position", "Positions", Briefcase, "values", "left"],
  ["clientType", "Client Type", Tag, "values", "center"],
  ["serviceType", "Service Type", Layers, "values", "left"],
  ["businessUnit", "BU", Network, "values", "center"],
  ["level", "Level", Signal, "values", "center"],
  ["headcount", "Headcount", Users, "number", "center"],
  ["durationMonths", "Durasi", Timer, "number", "center"],
  ["priority", "Priority", Flag, "values", "center"],
  ["bant", "BANTE", Gauge, "values", "center"],
  ["price", "Price", Banknote, "number", "right"],
  ["approvalDate", "Approval Date", CalendarCheck, "date", "center"],
  ["poDocs", "PO Doc", FileText, "none", "left"],
  ["salesPic", "Sales PIC", UserRound, "values", "left"],
  ["leadSource", "Lead Source", Megaphone, "values", "center"],
  ["requestDate", "Opty Request Date", CalendarClock, "date", "center"],
  ["startDate", "Start Date", CalendarRange, "date", "center"],
  ["endDate", "End Date", CalendarRange, "date", "center"],
  ["notes", "Notes", NotebookPen, "text", "left"],
] as const).map(([key, label, icon, kind, align]) => [key, { key, label, icon, kind, align, sortable: PQ_FIELD_KEYS.has(key) && kind !== "none" }]));

const text = (p: Pq, key: string) => String(pqFieldValue(p, key) ?? "");
const COLUMNS: Omit<DataTableColumn<Pq>, "header">[] = [
  { key: "client", type: "entity", accessor: (p) => p.client },
  { key: "optyNo", render: (_, p) => <span className="font-mono text-[12px] text-slate-600">{p.optyNo}</span> },
  {
    key: "pqNo",
    render: (_, p) => p.pqNo
      ? <span className="font-mono text-[12px] text-slate-600">{p.pqNo}</span>
      : needsPqNo(p) ? <span className="rounded bg-[#fdeee7] px-1.5 py-0.5 text-[12px] font-medium text-[#b2410f]">Perlu Generate PQ</span>
      : <span className="text-[12px] text-slate-400">Menunggu Talent Onboard</span>,
  },
  { key: "stage", type: "status", accessor: (p) => String(STAGE_ORDER[p.stage] ?? 9), format: (_, p) => PQ_STAGE_LABEL[p.stage] ?? p.stage, swatches: STAGE_SWATCH },
  { key: "optyStatus", accessor: (p) => text(p, "optyStatus") },
  {
    key: "signature",
    render: (_, p) => <span className={p.signature.status === "not_sent" ? "text-slate-400" : `rounded px-1.5 py-0.5 font-medium ${SIGN_CHIP[p.signature.status]}`}>{SIGNATURE_LABEL[p.signature.status]}</span>,
  },
  { key: "pqDocs", render: (_, p) => (p.pqDocs.length ? <FileLinks files={p.pqDocs} /> : <span className="text-slate-300">-</span>) },
  { key: "project" },
  { key: "position" },
  { key: "clientType", accessor: (p) => text(p, "clientType") },
  { key: "serviceType", accessor: (p) => text(p, "serviceType") },
  { key: "businessUnit", accessor: (p) => text(p, "businessUnit") },
  { key: "level", accessor: (p) => text(p, "level") },
  { key: "headcount", type: "number" },
  { key: "durationMonths", type: "number", format: (_, p) => (p.durationMonths ? `${p.durationMonths} bulan` : "") },
  { key: "priority", accessor: (p) => text(p, "priority") },
  { key: "bant", type: "number" },
  { key: "price", type: "number", format: (_, p) => rupiah(p.price, p.pricePeriod) },
  { key: "approvalDate", accessor: (p) => p.approvalDate ?? "" },
  {
    key: "poDocs",
    render: (_, p) => (p.poDocs.length || p.poDocUrl
      ? <span className="block space-y-1">{p.poDocUrl && <a href={p.poDocUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="block truncate text-[12px] text-brand-700 hover:underline">Link PO</a>}<FileLinks files={p.poDocs} /></span>
      : <span className="text-slate-300">-</span>),
  },
  { key: "salesPic" },
  { key: "leadSource", accessor: (p) => text(p, "leadSource") },
  { key: "requestDate", accessor: (p) => p.requestDate ?? "" },
  { key: "startDate", accessor: (p) => p.startDate ?? "" },
  { key: "endDate", accessor: (p) => p.endDate ?? "" },
  { key: "notes" },
];

function cellText(p: Pq, key: string): string {
  switch (key) {
    case "price": return rupiah(p.price, p.pricePeriod);
    case "pqNo": return p.pqNo ?? (needsPqNo(p) ? "Perlu Generate PQ" : "Menunggu Talent Onboard");
    case "durationMonths": return p.durationMonths ? `${p.durationMonths} bulan` : "";
    case "pqDocs": return p.pqDocs[0]?.name ?? "-";
    case "poDocs": return p.poDocs[0]?.name ?? (p.poDocUrl ? "Link PO" : "-");
    default: return text(p, key);
  }
}

const CONFIG: WorkspaceConfig<Pq> = {
  title: "PQ Tracker",
  subtitle: "Price quotation per opportunity: dokumen, tanda tangan dan status pipeline.",
  noun: "PQ",
  searchPlaceholder: "Cari client, PQ No, project…",
  storage: { columns: "celerates.salesV2.pq.columns", views: "celerates.salesV2.pq.savedViews" },
  fieldKeys: PQ_FIELD_KEYS,
  fieldValue: pqFieldValue,
  sortValue,
  matchesSearch: pqMatchesSearch,
  toolbarColumns,
  builtInViews: PQ_BUILT_IN_VIEWS,
  kpis: KPIS,
  specs: SPECS,
  columns: COLUMNS,
  cellText,
  valueOrder: { stage: PQ_STAGES.map((s) => s.title), optyStatus: OPTY_STATUS.map(([, l]) => l) },
  defaultShown: PQ_DEFAULT_SHOWN,
  grid: (p) => ({
    label: `${p.client} ${p.pqNo ?? p.optyNo}`,
    author: <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500"><span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: PQ_STAGES.find((s) => s.id === p.stage)?.accent ?? "#8a8f98" }} /><span className="font-mono">{p.pqNo ?? p.optyNo}</span> · {PQ_STAGE_LABEL[p.stage] ?? p.stage}</span>,
    title: p.client,
    excerpt: [p.project, p.position, p.headcount ? `${p.headcount} orang` : null, rupiah(p.price, p.pricePeriod)].filter(Boolean).join(" · ") || "-",
    footer: <span className="text-[12px] text-slate-500">{p.salesPic}{p.signature.status !== "not_sent" ? ` · TTD ${SIGNATURE_LABEL[p.signature.status].toLowerCase()}` : ""}{needsPqNo(p) ? " · Perlu Generate PQ" : ""}</span>,
    date: p.approvalDate ?? p.requestDate ?? undefined,
  }),
  // Kanban by Pipeline Stage, with V1's StageSelector rule (Opty Status follows Win / Drop / Hold).
  board: {
    stages: PQ_STAGES,
    stageOf: (p) => p.stage,
    withStage: withPqStage,
    move: (p, to) => savePqStage(p.id, to),
    // Undo puts back both: the stage and the Opty Status it had (a move to Hold changed it to Project on Hold).
    restore: async (p) => {
      await ok(updatePipelineStage(p.id, p.stage));
      await ok(updateOptyStatus(p.id, p.optyStatus ?? ""));
    },
    confirm: CONFIRM,
    recordLabel: (p) => p.pqNo ?? p.optyNo,
    cardLabel: (p) => `${p.client} ${p.pqNo ?? p.optyNo}`,
    renderCard: (p, open) => <KanbanCard p={p} onOpen={open} />,
    newCardLabel: "PQ baru",
  },
};
