"use client";
// Sales V2 Account (CRM): the shared record workspace (record-workspace.tsx) configured with V1 Account fields, a
// board by account status and V1's CRM actions. docs/design/SALES-V2-CRISP-UX-CONTRACT.md §16.
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, AlarmClock, Banknote, Briefcase, Building2, CalendarClock, CircleDot, Contact, Factory, FileSignature, NotebookPen,
  Receipt, Target, TrendingUp, UserRound, Users,
} from "lucide-react";
import { SnackbarProvider, type ContextMenuOption, type DataTableColumn, type TableToolbarColumn } from "@crisp-ui-kit/crisp";
import { updateClient } from "@/app/sales/accounts/actions";
import { RecordLink } from "./cells";
import type { HeaderSpec } from "./header-filter";
import { RecordWorkspace, type Access, type RowActions, type WorkspaceConfig } from "./record-workspace";
import { rupiah } from "./model";
import {
  ACCOUNT_BUILT_IN_VIEWS, ACCOUNT_DEFAULT_SHOWN, ACCOUNT_FIELD_KEYS, ACCOUNT_STATUSES, ACCOUNT_STATUS_LABEL,
  accountFieldValue, accountFormData, accountMatchesSearch, lastActivityOf, picOf, type Account,
} from "./account-model";
import { AccountPreview, CreateAccount, saveAccountStatus } from "./account-preview";

const STATUS_ORDER: Record<string, number> = Object.fromEntries(ACCOUNT_STATUSES.map((s, i) => [s.id, i]));
const STATUS_SWATCH = Object.fromEntries(ACCOUNT_STATUSES.map((s) => [s.id, s.swatch])) as Record<string, 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12>;

function sortValue(a: Account, key: string): unknown {
  if (key === "status") return STATUS_ORDER[a.status] ?? 99;
  return accountFieldValue(a, key);
}

function toolbarColumns(all: Account[]): TableToolbarColumn[] {
  const industries = Array.from(new Set(all.map((a) => a.industry).filter((v): v is string => !!v))).sort();
  return [
    { key: "name", label: "Account", type: "text" },
    { key: "status", label: "Status", type: "status", values: ACCOUNT_STATUSES.map((s) => s.title) },
    { key: "industry", label: "Industri", type: "select", values: industries },
    { key: "hasActiveOpty", label: "Ada Opportunity Aktif", type: "checkbox" },
    { key: "hasOverdue", label: "Ada Invoice Overdue", type: "checkbox" },
    { key: "activeOpportunities", label: "Opportunity Aktif", type: "number" },
    { key: "opportunities", label: "Total Opportunity", type: "number" },
    { key: "leads", label: "Leads", type: "number" },
    { key: "contracts", label: "Kontrak", type: "number" },
    { key: "monthlyValue", label: "Nilai Kontrak/bln", type: "number" },
    { key: "invoices", label: "Invoice", type: "number" },
    { key: "overdueInvoices", label: "Invoice Overdue", type: "number" },
    { key: "pic", label: "Kontak PIC", type: "text" },
    { key: "contactCount", label: "Jumlah Kontak", type: "number" },
    { key: "lastActivity", label: "Aktivitas Terakhir", type: "date" },
    { key: "activityCount", label: "Jumlah Aktivitas", type: "number" },
    { key: "notes", label: "Notes", type: "text" },
    { key: "createdBy", label: "Dibuat oleh", type: "text" },
    { key: "createdAt", label: "Dibuat", type: "date" },
  ];
}

type Props = { records: Account[]; access: Access };

export function AccountWorkspace(props: Props) {
  return (
    <SnackbarProvider>
      <Workspace {...props} />
    </SnackbarProvider>
  );
}

function Workspace({ records, access }: Props) {
  const [create, setCreate] = useState<null | { status?: string }>(null);
  const names = useMemo(() => new Set(records.map((r) => r.name)), [records]);
  // V1's "Total Nilai Kontrak" card: a sum, not a filter, so it sits beside the title.
  const total = records.reduce((s, r) => s + r.monthlyValue, 0);
  return (
    <RecordWorkspace
      config={CONFIG}
      records={records}
      access={access}
      headerEnd={
        <>
          <span className="text-[0.75rem] text-slate-500" data-sales-v2-total>Nilai kontrak <b className="tabular-nums text-slate-800">{rupiah(total)}/bln</b></span>
          <Link href="/sales/accounts" className="text-[0.75rem] text-slate-400 hover:text-slate-700 hover:underline" title="Tampilan lama (V1)">Versi lama</Link>
        </>
      }
      toolbarEnd={access.canEdit && <CreateAccount names={names} open={!!create} status={create?.status} onOpen={() => setCreate({})} onClose={() => setCreate(null)} />}
      renderPanel={(p) => <AccountPreview record={p.record} records={p.records} access={access} onSelect={p.select} onClose={p.close} onPatch={p.patch} request={p.request} onRequestHandled={p.clearRequest} />}
      renderMoveDialog={() => null}
    />
  );
}

// ── Summary cards: V1's (Total, Perlu Follow-up) plus the other statuses and what needs a look ─────────────────
const KPIS: WorkspaceConfig<Account>["kpis"] = [
  { id: "all", label: "Total Account", color: "navy", match: () => true },
  { id: "prospect", label: "Perlu Follow-up", color: "red", match: (a) => a.status === "prospect" },
  { id: "active", label: "Active", color: "green", match: (a) => a.status === "active" },
  { id: "dormant", label: "Dormant", color: "purple", match: (a) => a.status === "dormant" },
  { id: "active_opty", label: "Ada Opportunity Aktif", color: "blue", match: (a) => a.activeOpportunities > 0 },
  { id: "overdue", label: "Invoice Overdue", color: "orange", match: (a) => a.overdueInvoices > 0 },
];

const money = (a: Account) => (a.monthlyValue > 0 ? `${rupiah(a.monthlyValue)}/bln` : "");

function KanbanCard({ a, onOpen }: { a: Account; onOpen: () => void }) {
  const pic = picOf(a);
  return (
    <button type="button" onClick={onOpen} className="block w-full space-y-1 text-left" data-card-preview={a.id}>
      <span className="block truncate text-[0.8125rem] font-semibold leading-5 text-slate-900">{a.name}</span>
      <span className="block truncate text-[0.75rem] text-slate-500">{a.industry || "Industri belum diisi"}</span>
      <span className="block truncate text-[0.75rem] text-slate-700">{[a.activeOpportunities ? `${a.activeOpportunities} opportunity aktif` : null, money(a) || null].filter(Boolean).join(" · ") || "Belum ada opportunity aktif"}</span>
      <span className="mt-1 flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5 text-[0.6875rem] text-slate-500">
        <span className="truncate">{pic?.name ?? "Belum ada kontak"}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {a.overdueInvoices > 0 && <span className="rounded bg-red-50 px-1 font-semibold text-red-700">Overdue</span>}
          {lastActivityOf(a) && <span>{lastActivityOf(a)}</span>}
        </span>
      </span>
    </button>
  );
}

// ── Table columns: Account first and pinned ────────────────────────────────────────────────────────────────
const SPECS: Record<string, HeaderSpec> = Object.fromEntries(([
  ["name", "Account", Building2, "values", "left"],
  ["status", "Status", CircleDot, "values", "center"],
  ["industry", "Industri", Factory, "values", "left"],
  ["activeOpportunities", "Opportunity Aktif", TrendingUp, "number", "center"],
  ["opportunities", "Total Opportunity", Briefcase, "number", "center"],
  ["leads", "Leads", Target, "number", "center"],
  ["contracts", "Kontrak", FileSignature, "number", "center"],
  ["monthlyValue", "Nilai Kontrak/bln", Banknote, "number", "right"],
  ["invoices", "Invoice", Receipt, "number", "center"],
  ["overdueInvoices", "Invoice Overdue", AlarmClock, "number", "center"],
  ["pic", "Kontak PIC", Contact, "values", "left"],
  ["contactCount", "Jumlah Kontak", Users, "number", "center"],
  ["lastActivity", "Aktivitas Terakhir", Activity, "date", "center"],
  ["activityCount", "Jumlah Aktivitas", Activity, "number", "center"],
  ["notes", "Notes", NotebookPen, "text", "left"],
  ["createdBy", "Dibuat oleh", UserRound, "values", "left"],
  ["createdAt", "Dibuat", CalendarClock, "date", "center"],
] as const).map(([key, label, icon, kind, align]) => [key, { key, label, icon, kind, align, sortable: true }]));

const text = (a: Account, key: string) => String(accountFieldValue(a, key) ?? "");
const COLUMNS: Omit<DataTableColumn<Account>, "header">[] = [
  { key: "name", render: (_, a) => <RecordLink id={a.id}>{a.name}</RecordLink> },
  { key: "status", type: "status", accessor: (a) => a.status, format: (_, a) => ACCOUNT_STATUS_LABEL[a.status] ?? a.status, swatches: STATUS_SWATCH, editor: "select", options: ACCOUNT_STATUSES.map((s) => ({ value: s.id, label: s.title })) },
  { key: "industry", accessor: (a) => a.industry ?? "" },
  { key: "activeOpportunities", type: "number" },
  { key: "opportunities", type: "number" },
  { key: "leads", type: "number" },
  { key: "contracts", type: "number" },
  { key: "monthlyValue", type: "number", format: (_, a) => money(a) },
  { key: "invoices", type: "number" },
  { key: "overdueInvoices", type: "number", render: (_, a) => (a.overdueInvoices ? <span className="font-semibold text-red-700">{a.overdueInvoices}</span> : <span className="text-slate-400">0</span>) },
  { key: "pic", accessor: (a) => text(a, "pic") },
  { key: "contactCount", type: "number", accessor: (a) => a.contacts.length },
  { key: "lastActivity", accessor: (a) => lastActivityOf(a) ?? "" },
  { key: "activityCount", type: "number", accessor: (a) => a.activities.length },
  { key: "notes", accessor: (a) => a.notes ?? "" },
  { key: "createdBy", accessor: (a) => a.createdBy ?? "" },
  { key: "createdAt", accessor: (a) => a.createdAt?.slice(0, 10) ?? "" },
];

function cellText(a: Account, key: string): string {
  if (key === "monthlyValue") return money(a);
  if (key === "createdAt") return a.createdAt?.slice(0, 10) ?? "";
  return text(a, key);
}

/** Right-click on a row: the panel's actions, each only when allowed. */
function rowMenu(a: Account, { access, open }: RowActions): ContextMenuOption[] {
  const items: ContextMenuOption[] = [{ label: "Buka", onSelect: () => open(a.id) }];
  if (!access.canEdit) return items;
  items.push(
    { label: "Catat aktivitas", onSelect: () => open(a.id, "activity") },
    { label: "Tambah kontak", onSelect: () => open(a.id, "contact") },
    { label: "Edit (form lengkap)", onSelect: () => open(a.id, "edit") },
  );
  if (access.canDelete) items.push({ separator: true }, { label: "Hapus", danger: true, onSelect: () => open(a.id, "delete") });
  return items;
}

/** In-cell edits (QA 2026-10-08): V1's updateClient, which writes name, industry, status and notes together. */
const field = (key: "industry" | "status" | "notes", form: string) => ({
  field: form,
  patch: (_: Account, v: string) => ({ [key]: key === "status" ? v : v.trim() || null }) as Partial<Account>,
  save: (a: Account, v: string) => { const fd = accountFormData(a); fd.set(form, v.trim()); return updateClient(a.id, fd); },
});
const EDITS: WorkspaceConfig<Account>["edits"] = {
  industry: field("industry", "industry"),
  status: { required: true, ...field("status", "status_code") },
  notes: field("notes", "notes"),
};

const CONFIG: WorkspaceConfig<Account> = {
  title: "Account (CRM)",
  subtitle: "Semua klien dari Marketing & Sales: kontak, aktivitas, dan riwayat lead, PQ, kontrak dan invoice.",
  noun: "account",
  searchPlaceholder: "Cari account, industri, kontak…",
  recordType: "crm_client",
  storage: { columns: "celerates.salesV2.accounts.columns", views: "celerates.salesV2.accounts.savedViews" },
  fieldKeys: ACCOUNT_FIELD_KEYS,
  fieldValue: accountFieldValue,
  sortValue,
  matchesSearch: accountMatchesSearch,
  toolbarColumns,
  builtInViews: ACCOUNT_BUILT_IN_VIEWS,
  kpis: KPIS,
  specs: SPECS,
  columns: COLUMNS,
  cellText,
  valueOrder: { status: ACCOUNT_STATUSES.map((s) => s.title) },
  defaultShown: ACCOUNT_DEFAULT_SHOWN,
  rowMenu,
  edits: EDITS,
  grid: (a) => ({
    label: a.name,
    author: <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-slate-500"><span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: ACCOUNT_STATUSES.find((s) => s.id === a.status)?.accent ?? "#8a8f98" }} />{ACCOUNT_STATUS_LABEL[a.status] ?? a.status}{a.industry ? ` · ${a.industry}` : ""}</span>,
    title: a.name,
    excerpt: [`${a.activeOpportunities} opportunity aktif`, money(a) || null, a.overdueInvoices ? `${a.overdueInvoices} invoice overdue` : null].filter(Boolean).join(" · "),
    footer: <span className="text-[0.75rem] text-slate-500">{picOf(a)?.name ?? "Belum ada kontak"}{a.activities[0] ? ` · ${a.activities[0].title}` : ""}</span>,
    date: lastActivityOf(a) ?? undefined,
  }),
  // Board by account status (V1's Prospect / Active / Dormant); a move is V1's updateClient, undone the same way.
  board: {
    stages: ACCOUNT_STATUSES,
    stageOf: (a) => a.status,
    withStage: (_, to) => ({ status: to }),
    move: (a, to) => saveAccountStatus(a, to),
    confirm: new Set(),
    recordLabel: (a) => a.name,
    cardLabel: (a) => a.name,
    renderCard: (a, open) => <KanbanCard a={a} onOpen={open} />,
  },
};
