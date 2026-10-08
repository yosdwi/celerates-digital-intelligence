"use client";
// Sales V2 Opportunity Tracker: the shared record workspace (record-workspace.tsx) configured with Celerates
// Opportunity fields, stages and actions. docs/design/SALES-V2-CRISP-UX-CONTRACT.md is the contract.
import { useState } from "react";
import Link from "next/link";
import {
  BadgeCheck, Banknote, Briefcase, Building2, CalendarClock, CircleDot, CircleX, FileText, Gauge, GitBranch, HandCoins, Hash,
  Layers, Megaphone, NotebookPen, Signal, Tag, Timer, UserRound, Users,
} from "lucide-react";
import { SnackbarProvider, type ContextMenuOption, type DataTableColumn, type TableToolbarColumn } from "@crisp-ui-kit/crisp";
import { useToast } from "@/components/toast-provider";
import { saveOpportunityTracker, updateOptyStatus, updateSalesQualified } from "@/app/sales/opportunity-tracker/actions";
import { CreateMenu, type CreateRequest, type FormOptions } from "./forms";
import type { HeaderSpec } from "./header-filter";
import { CONFIRM_STAGES, StageMoveDialog } from "./stage-move";
import { SheetSyncButton, OT_SHEET_SYNC } from "./sheet-sync-dialog";
import type { SheetSyncData } from "./data";
import { RecordPreview } from "./record-preview";
import { RecordWorkspace, type Access, type RowActions, type WorkspaceConfig } from "./record-workspace";
import { RecordLink } from "./cells";
import {
  BANTE_SCORES, BUILT_IN_VIEWS, CLIENT_TYPES, OT_FIELD_EDITS, editValues, fieldFormData, DEFAULT_SHOWN, FIELD_KEYS, LEVELS, SERVICE_TYPES, STAGES, STAGE_LABEL, SERVICE_LABEL, LEVEL_LABEL, CLIENT_TYPE_LABEL,
  canConvert, daysSince, fieldValue, matchesSearch, rupiah, type Opportunity,
} from "./model";

const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s.id, i]));

/** Sort reads stage order for Stage and raw numbers for amounts; everything else as displayed. */
function sortValue(o: Opportunity, key: string): unknown {
  if (key === "status") return STAGE_ORDER[o.status] ?? 99;
  if (key === "converted") return o.pq ? 1 : 0;
  return fieldValue(o, key);
}

function toolbarColumns(all: Opportunity[]): TableToolbarColumn[] {
  const salesPics = Array.from(new Set(all.map((r) => r.salesPic).filter(Boolean))).sort();
  return [
    { key: "client", label: "Client", type: "text" },
    { key: "optyNo", label: "Opty No", type: "text" },
    { key: "leadNo", label: "Leads No", type: "text" },
    { key: "status", label: "Stage", type: "status", values: STAGES.map((s) => s.title) },
    { key: "salesQualified", label: "Sales Qualified", type: "checkbox" },
    { key: "converted", label: "Sudah Convert", type: "checkbox" },
    { key: "serviceType", label: "Service Type", type: "select", values: SERVICE_TYPES.map(([, l]) => l) },
    { key: "clientType", label: "Client Type", type: "select", values: CLIENT_TYPES.map(([, l]) => l) },
    { key: "position", label: "Positions", type: "text" },
    { key: "level", label: "Level", type: "select", values: LEVELS.map(([, l]) => l) },
    { key: "headcount", label: "Headcount", type: "number" },
    { key: "price", label: "Price", type: "number" },
    { key: "closingPrice", label: "Closing Price Deal", type: "number" },
    { key: "salesPic", label: "Sales PIC", type: "select", values: salesPics },
    { key: "lastCommunication", label: "Last Communication", type: "date" },
    { key: "bante", label: "BANTE", type: "number" },
    { key: "durationMonths", label: "Durasi (bulan)", type: "number" },
    { key: "createdAt", label: "Dibuat", type: "date" },
    { key: "requirement", label: "Requirement", type: "text" },
    { key: "detailRequirement", label: "Detail Requirement", type: "text" },
    { key: "progressNotes", label: "Progress Notes", type: "text" },
    { key: "droppedReason", label: "Dropped Reason", type: "text" },
  ];
}

type WorkspaceProps = { records: Opportunity[]; access: Access; options: FormOptions; sheetSync: SheetSyncData | null };

/** Crisp's Snackbar (Undo after a Kanban move) needs its provider above the workspace. */
export function OpportunityWorkspace(props: WorkspaceProps) {
  return (
    <SnackbarProvider>
      <Workspace {...props} />
    </SnackbarProvider>
  );
}

function Workspace({ records, access, options, sheetSync }: WorkspaceProps) {
  const { showToast } = useToast();
  const [create, setCreate] = useState<CreateRequest>(null);
  const [convertRequest, setConvertRequest] = useState<string | null>(null);
  return (
    <RecordWorkspace
      config={CONFIG}
      records={records}
      access={access}
      headerEnd={<Link href="/sales/opportunity-tracker" className="text-[0.75rem] text-slate-400 hover:text-slate-700 hover:underline" title="Tampilan lama (V1)">Versi lama</Link>}
      toolbarEnd={
        <>
          {sheetSync && <SheetSyncButton data={sheetSync} parts={OT_SHEET_SYNC} />}
          {access.canEdit && <CreateMenu options={options} create={create} onCreate={setCreate} />}
        </>
      }
      renderPanel={(p) => (
        <RecordPreview
          record={p.record}
          records={p.records}
          access={access}
          returnTo={p.returnTo}
          onSelect={p.select}
          onClose={p.close}
          onPatch={p.patch}
          options={options}
          request={p.request ?? (convertRequest ? { id: convertRequest, action: "convert" } : null)}
          onRequestHandled={() => { p.clearRequest(); setConvertRequest(null); }}
        />
      )}
      renderMoveDialog={(m) => (
        <StageMoveDialog
          move={m.move}
          returnTo={m.returnTo}
          onCancel={m.onCancel}
          onError={(message) => showToast(message, "error")}
          onMoved={(move, convert) => {
            m.onMoved();
            if (convert) { m.select(move.record.id); setConvertRequest(move.record.id); }
          }}
        />
      )}
    />
  );
}

// ── Summary cards: built-in views, in the ERP palette ───────────────────────────────────────────────────────
const OPEN = new Set(["cv_submission", "solutioning", "proposal_sent", "need_action"]);
const KPIS: WorkspaceConfig<Opportunity>["kpis"] = [
  { id: "all", label: "Total Opportunity", color: "navy", match: () => true },
  { id: "active", label: "Pipeline aktif", color: "blue", match: (o) => OPEN.has(o.status) },
  { id: "ready", label: "Siap Convert", color: "amber", match: (o) => o.salesQualified && !o.pq },
  { id: "win", label: "Win", color: "green", match: (o) => o.status === "win" },
  { id: "dropped", label: "Dropped", color: "red", match: (o) => o.status === "dropped" },
];

const STAGE_ACCENT: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.id, s.accent]));
function StageDot({ status }: { status: string }) {
  return <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: STAGE_ACCENT[status] ?? "#8a8f98" }} />;
}

const initials = (name: string) => name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** Kanban card, Attio-style: who, what, how much, who owns it, how fresh. The stage colour is the card's left edge (CSS). */
function KanbanCard({ o, onOpen }: { o: Opportunity; onOpen: () => void }) {
  const age = daysSince(o.lastCommunication);
  return (
    <button type="button" onClick={onOpen} className="block w-full space-y-1 text-left" data-card-preview={o.id}>
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[0.8125rem] font-semibold leading-5 text-slate-900">{o.client}</span>
        {o.salesQualified && <BadgeCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Sales Qualified" />}
      </span>
      <span className="block truncate font-mono text-[0.6875rem] text-slate-500">{o.optyNo}{o.leadNo ? ` · ${o.leadNo}` : ""}</span>
      {(o.position || o.headcount) && (
        <span className="block truncate text-[0.75rem] text-slate-700">{[o.position, o.level ? LEVEL_LABEL[o.level] ?? o.level : null, o.headcount ? `${o.headcount} HC` : null].filter(Boolean).join(" · ")}</span>
      )}
      {o.price != null && <span className="block text-[0.8125rem] font-semibold tabular-nums text-slate-900">{rupiah(o.price, o.pricePeriod)}</span>}
      <span className="mt-1 flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5 text-[0.6875rem] text-slate-500">
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dce8ef] text-[0.625rem] font-semibold text-[#123650]">{initials(o.salesPic)}</span>
          <span className="truncate">{o.salesPic}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {o.requisition ? <span className="rounded bg-[#e8eefd] px-1 font-semibold text-[#1a43b8]">REQ</span> : o.pq ? <span className="rounded bg-violet-50 px-1 font-semibold text-violet-700">PQ</span> : null}
          {age != null && <span className={age > 14 ? "font-semibold text-red-600" : ""} title={`Last Communication ${o.lastCommunication}`}>{age}h</span>}
        </span>
      </span>
    </button>
  );
}

/** Right-click on a row: V1's quick actions (Aksi / Status), each only when this user and this record allow it. */
function rowMenu(o: Opportunity, { access, open }: RowActions): ContextMenuOption[] {
  const items: ContextMenuOption[] = [{ label: "Buka", onSelect: () => open(o.id) }];
  if (!access.canEdit) return items;
  items.push({ label: "Edit (form lengkap)", onSelect: () => open(o.id, "edit") });
  if (canConvert(o)) items.push({ label: "Convert to Requisition", onSelect: () => open(o.id, "convert") });
  if (access.canDelete && !o.pq && !o.requisition) items.push({ separator: true }, { label: "Hapus", danger: true, onSelect: () => open(o.id, "delete") });
  return items;
}

/** In-cell edits (QA 2026-10-08): the V1 edit form for one field (saveOpportunityTracker, no redirect), and V1's own
 *  actions for Stage and Sales Qualified. */
const EDITS: WorkspaceConfig<Opportunity>["edits"] = {
  ...Object.fromEntries(Object.entries(OT_FIELD_EDITS).map(([key, f]) => [key, {
    required: f.required,
    patch: (_: Opportunity, v: string) => f.patch(v),
    save: (o: Opportunity, v: string) => saveOpportunityTracker(o.id, fieldFormData(editValues(o), f.form, v)),
  }])),
  status: { required: true, patch: (_, v) => ({ status: v }), save: (o, v) => updateOptyStatus(o.id, v) },
  salesQualified: { patch: (_, v) => ({ salesQualified: v === "true" }), save: (o, v) => updateSalesQualified(o.id, v === "true") },
};
const opt = (pairs: readonly (readonly [string, string])[]) => pairs.map(([value, label]) => ({ value, label }));
const label = (labels: Record<string, string>, v: string | null) => (v ? labels[v] ?? v : "");


// ── Table columns: every Celerates field, the useful ones shown by default (contract §7) ──────────────────────
// Header alignment follows the values under it: centre for short codes, dates and counts, right for money.
const SPECS: Record<string, HeaderSpec> = Object.fromEntries(([
  ["client", "Client", Building2, "values", "left"],
  ["optyNo", "Opty No", Hash, "text", "left"],
  ["status", "Stage", CircleDot, "values", "center"],
  ["position", "Positions", Briefcase, "values", "left"],
  ["headcount", "Headcount", Users, "number", "center"],
  ["price", "Price", Banknote, "number", "right"],
  ["salesPic", "Sales PIC", UserRound, "values", "left"],
  ["salesQualified", "Sales Qualified", BadgeCheck, "bool", "center"],
  ["lastCommunication", "Last Communication", CalendarClock, "date", "center"],
  ["downstream", "Requisition / PQ", GitBranch, "none", "left"],
  ["leadNo", "Leads No", Megaphone, "text", "left"],
  ["clientType", "Client Type", Tag, "values", "center"],
  ["serviceType", "Service Type", Layers, "values", "left"],
  ["level", "Level", Signal, "values", "center"],
  ["durationMonths", "Durasi", Timer, "number", "center"],
  ["requirement", "Requirement", FileText, "text", "left"],
  ["detailRequirement", "Detail Requirement", FileText, "text", "left"],
  ["closingPrice", "Closing Price Deal", HandCoins, "number", "right"],
  ["bante", "BANTE", Gauge, "values", "center"],
  ["progressNotes", "Progress Notes", NotebookPen, "text", "left"],
  ["droppedReason", "Dropped Reason", CircleX, "text", "left"],
] as const).map(([key, label, icon, kind, align]) => [key, { key, label, icon, kind, align, sortable: FIELD_KEYS.has(key) }]));

// Stage chips in Crisp's tag palette, keyed by stage code (the select editor reads the same code).
const STAGE_SWATCH = Object.fromEntries(STAGES.map((s) => [s.id, s.swatch])) as Record<string, 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12>;
const ALL_COLUMNS: Omit<DataTableColumn<Opportunity>, "header">[] = [
  { key: "client", width: 150, render: (_, o) => <RecordLink id={o.id}>{o.client}</RecordLink> },
  { key: "optyNo", width: 112, render: (_, o) => <span className="font-mono text-[0.75rem] text-slate-600">{o.optyNo}</span> },
  { key: "status", type: "status", accessor: (o) => o.status, format: (_, o) => STAGE_LABEL[o.status] ?? o.status, swatches: STAGE_SWATCH, editor: "select", options: STAGES.map((s) => ({ value: s.id, label: s.title })) },
  { key: "position" },
  { key: "headcount", type: "number" },
  { key: "price", type: "number", format: (_, o) => rupiah(o.price, o.pricePeriod) },
  { key: "salesPic" },
  { key: "salesQualified", accessor: (o) => String(o.salesQualified), editor: "checkbox" },
  { key: "lastCommunication", type: "date", accessor: (o) => o.lastCommunication ?? "", format: (_, o) => o.lastCommunication ?? "" },
  { key: "downstream", render: (_, o) => o.requisition ? <span className="font-mono text-[0.75rem]">{o.requisition.no}</span> : o.pq ? <span className="text-[0.75rem]">PQ · Extension</span> : <span className="text-slate-400">-</span> },
  { key: "leadNo", width: 104, render: (_, o) => <span className="font-mono text-[0.75rem] text-slate-600">{o.leadNo ?? "-"}</span> },
  { key: "clientType", accessor: (o) => o.clientType ?? "", format: (_, o) => label(CLIENT_TYPE_LABEL, o.clientType), editor: "select", options: opt(CLIENT_TYPES) },
  { key: "serviceType", accessor: (o) => o.serviceType ?? "", format: (_, o) => label(SERVICE_LABEL, o.serviceType), editor: "select", options: opt(SERVICE_TYPES) },
  { key: "level", accessor: (o) => o.level ?? "", format: (_, o) => label(LEVEL_LABEL, o.level), editor: "select", options: opt(LEVELS) },
  { key: "durationMonths", type: "number", format: (_, o) => (o.durationMonths ? `${o.durationMonths} bulan` : "") },
  { key: "requirement" },
  { key: "detailRequirement" },
  { key: "closingPrice", type: "number", format: (_, o) => rupiah(o.closingPrice) },
  { key: "bante", accessor: (o) => (o.bante == null ? "" : String(o.bante)), editor: "select", options: opt(BANTE_SCORES) },
  { key: "progressNotes" },
  { key: "droppedReason" },
];
/** What a cell shows, as text: drives the auto column width. */
function cellText(o: Opportunity, key: string): string {
  switch (key) {
    case "price": return rupiah(o.price, o.pricePeriod);
    case "closingPrice": return rupiah(o.closingPrice);
    case "downstream": return o.requisition?.no ?? (o.pq ? "PQ · Extension" : "-");
    case "salesQualified": return o.salesQualified ? "Qualified" : "Belum";
    case "durationMonths": return o.durationMonths ? `${o.durationMonths} bulan` : "";
    default: return String(fieldValue(o, key) ?? "");
  }
}


const CONFIG: WorkspaceConfig<Opportunity> = {
  title: "Opportunity Tracker",
  subtitle: "Evaluasi requirement klien sebelum lanjut ke proses hiring.",
  noun: "opportunity",
  searchPlaceholder: "Cari client, Opty No, PIC…",
  // columns v2: every column is shown by default (as V1 and Attio); the bump reset earlier per-browser choices once.
  storage: { columns: "celerates.salesV2.columns.v2", views: "celerates.salesV2.savedViews" },
  fieldKeys: FIELD_KEYS,
  fieldValue,
  sortValue,
  matchesSearch,
  toolbarColumns,
  builtInViews: BUILT_IN_VIEWS,
  boardViews: ["active"],
  kpis: KPIS,
  specs: SPECS,
  columns: ALL_COLUMNS,
  cellText,
  valueOrder: { status: STAGES.map((s) => s.title) },
  defaultShown: DEFAULT_SHOWN,
  // V1 freezes Aksi / Status, Opty No, Leads No and Klien (opportunity-trackers-table.tsx); Aksi became in-cell edits,
  // the row's right-click menu and the panel (QA 2026-10-08).
  frozen: ["optyNo", "leadNo", "client"],
  rowMenu,
  edits: EDITS,
  grid: (o) => ({
    label: `${o.client} ${o.optyNo}`,
    author: <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-slate-500"><StageDot status={o.status} /><span className="font-mono">{o.optyNo}</span> · {STAGE_LABEL[o.status] ?? o.status}</span>,
    title: o.client,
    excerpt: [o.position, o.headcount ? `${o.headcount} orang` : null, rupiah(o.price, o.pricePeriod)].filter(Boolean).join(" · ") || "-",
    footer: <span className="text-[0.75rem] text-slate-500">{o.salesPic}{o.salesQualified ? " · Qualified" : ""}{o.pq ? " · Sudah convert" : ""}</span>,
    date: o.lastCommunication ?? undefined,
  }),
  // Kanban (contract §12): the same updateOptyStatus V1's board calls; Win and Dropped ask first (stage-move.tsx).
  board: {
    stages: STAGES,
    stageOf: (o) => o.status,
    withStage: (_, to) => ({ status: to }),
    move: async (o, to) => { await updateOptyStatus(o.id, to); },
    confirm: CONFIRM_STAGES,
    recordLabel: (o) => o.optyNo,
    cardLabel: (o) => `${o.client} ${o.optyNo}`,
    renderCard: (o, open) => <KanbanCard o={o} onOpen={open} />,
  },
};
