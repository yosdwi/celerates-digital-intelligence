"use client";
// Sales V2 Overtime & Business Trip: the shared record workspace (record-workspace.tsx) over PMO's claims, with V1's
// flow (PMO → Sales → Finance → Invoiced) on a board and HR's talent payment beside it. Every write is a V1 action
// (app/pmo/overtime-business-trip/actions.ts), each step only for its division, so V1 and V2 always show the same data.
// Parity list: docs/design/SALES-V2-TAB-MIGRATION.md §Overtime & Business Trip.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, Banknote, Building2, CalendarClock, CalendarDays, CircleDot, ClipboardCheck, FileText, FolderKanban, Hash, Link2,
  NotebookPen, Plus, Receipt, Tag, Timer, Trash2, UserRound, Wallet,
} from "lucide-react";
import {
  Button, Dialog, DialogBody, DialogFooter, Input, RecordPanel, Select, SnackbarProvider, Textarea,
  type ContextMenuOption, type DataTableColumn, type TableToolbarColumn,
} from "@crisp-ui-kit/crisp";
import { useToast } from "@/components/toast-provider";
import {
  createClaim, deleteClaim, forwardToSales, markInvoiced, submitToFinance, updateBillingStatus, updateClaimFields, updateTalentPayment,
  type ClaimActionResult,
} from "@/app/pmo/overtime-business-trip/actions";
import { F, Money, opts, useCloseFromXOnly, useSubmit, DraftFooter } from "./forms";
import { RecordLink } from "./cells";
import type { HeaderSpec } from "./header-filter";
import { RecordTimeline } from "./history";
import {
  PanelTitle, RecordWorkspace, useRecordPanelRail, useRowActions, type Access, type MoveContext, type PanelContext, type RowActions, type WorkspaceConfig,
} from "./record-workspace";
import { rupiah } from "./model";
import {
  BILLING_LABELS, BILLING_STATUSES, CLAIM_STATUSES, CLAIM_STATUS_LABELS, CLAIM_TYPES, CLAIM_TYPE_LABELS, FLOW, FORM_FIELDS, OT_BUILT_IN_VIEWS,
  OT_DEFAULT_SHOWN, OT_FIELD_KEYS, PAYMENT_LABELS, PROGRESS_LABELS, SIMPLE_PROGRESS_STATUSES, TALENT_PAYMENT_STATUSES, claimForm, claimMonth,
  flowMove, MONEY_FIELDS, nextStep, otFieldValue, otMatchesSearch, parseField, paymentForm, type FormField, type OtClaim,
} from "./ot-claims-model";

/** The divisions the signed-in person may act for (Editor or more; the Owner all). */
export type Roles = { pmo: boolean; sales: boolean; finance: boolean; hr: boolean; pmoFull: boolean };
type Option = { value: string; label: string };
type Options = { opportunities: Option[]; employees: Option[] };
type Swatch = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

const DIVISION: Record<string, string> = { pmo: "PMO", sales: "Sales", finance: "Finance", hr: "HR" };
const STATUS_SWATCH: Record<string, Swatch> = { draft: 7, forwarded_to_sales: 10, submitted_to_finance: 11, invoiced: 5 };
const STATUS_ACCENT: Record<string, string> = { draft: "#8a8f98", forwarded_to_sales: "#3b82f6", submitted_to_finance: "#6366f1", invoiced: "#10b981" };
const TYPE_SWATCH: Record<string, Swatch> = { overtime: 10, ganti_hari: 11, business_trip: 9, reimbursement: 5, medical_claim: 8, mcu: 12, cash_advance: 9 };
const PAYMENT_SWATCH: Record<string, Swatch> = { pending: 9, done: 5, hold: 8 };
const PROGRESS_SWATCH: Record<string, Swatch> = { not_started: 7, on_progress: 10, done: 5 };
const money = (n: number | null) => (n ? rupiah(n) : "");
const text = (c: OtClaim, key: string) => String(otFieldValue(c, key) ?? "");
const ok = async (p: Promise<ClaimActionResult>) => { const r = await p; if (!r.ok) throw new Error(r.error); };

/** A flow step by its division's V1 action; throws the reason it cannot run. */
async function runStep(c: OtClaim, to: string, roles: Roles, invoice?: FormData) {
  const m = flowMove(c.status_code, to);
  if ("error" in m) throw new Error(m.error);
  if (!roles[m.division as keyof Roles]) throw new Error(`Langkah ini dilakukan ${DIVISION[m.division]}.`);
  if (m.step === "forward") return ok(forwardToSales(c.id));
  if (m.step === "submit") return ok(submitToFinance(c.id));
  if (!invoice) throw new Error("Isi nomor invoice dulu.");
  return ok(markInvoiced(c.id, invoice));
}

// ── Columns: every V1 field, its own column; title pinned ────────────────────────────────────────────────────
type Col = [key: string, label: string, icon: HeaderSpec["icon"], kind: HeaderSpec["kind"], align: HeaderSpec["align"]];
const COLS: Col[] = [
  ["claim_title", "Judul klaim", FileText, "text", "left"],
  ["claim_no", "Claim No", Hash, "text", "left"],
  ["claim_month", "Bulan Claim", CalendarDays, "values", "center"],
  ["claim_type_code", "Tipe", Tag, "values", "center"],
  ["candidate_name", "Talent", UserRound, "values", "left"],
  ["employee_no", "ID Employee", Hash, "text", "left"],
  ["opty_no", "ID Opty", Hash, "values", "left"],
  ["client_name", "Client", Building2, "values", "left"],
  ["project_name", "Project", FolderKanban, "values", "left"],
  ["days_count", "Jumlah Hari", Timer, "number", "center"],
  ["start_date", "Start Date", CalendarDays, "date", "center"],
  ["end_date", "End Date", CalendarDays, "date", "center"],
  ["duration_hours_client", "Durasi ke Client (jam)", Timer, "number", "center"],
  ["duration_hours_pmo_basic", "Basic Durasi PMO (jam)", Timer, "number", "center"],
  ["duration_hours_payroll", "Durasi Payroll (jam)", Timer, "number", "center"],
  ["spk_url", "SPK", Link2, "text", "left"],
  ["timesheet_url", "Timesheet", Link2, "text", "left"],
  ["draft_timesheet_url", "Draft Timesheet", Link2, "text", "left"],
  ["pq_submit_date", "PQ Submit Date", CalendarDays, "date", "center"],
  ["pq_status_code", "PQ Status", ClipboardCheck, "values", "center"],
  ["po_status_code", "PO Status", ClipboardCheck, "values", "center"],
  ["cr_status_code", "CR Status", ClipboardCheck, "values", "center"],
  ["pic_1_name", "PIC 1 (PMO)", UserRound, "values", "left"],
  ["status_code", "Status Alur", CircleDot, "values", "center"],
  ["amount_given_to_talent_initial", "Pencairan ke Talent", Wallet, "number", "right"],
  ["amount_claim_to_client_total", "Total Claim ke Client", Banknote, "number", "right"],
  ["amount_bt_medical_to_client", "BT/Medical ke Client", Banknote, "number", "right"],
  ["amount_uang_saku_celerates", "Uang Saku Celerates", Banknote, "number", "right"],
  ["amount_transport", "Transport", Banknote, "number", "right"],
  ["amount_over_bagasi", "Over Bagasi", Banknote, "number", "right"],
  ["amount_etc", "Etc", Banknote, "number", "right"],
  ["invoice_no", "Invoice No", Receipt, "text", "left"],
  ["amount_total_billed_to_client", "Ditagih ke Client", Receipt, "number", "right"],
  ["billing_status_code", "Status Penagihan", CircleDot, "values", "center"],
  ["talent_payment_status_code", "Pencairan Talent (HR)", Wallet, "values", "center"],
  ["amount_total_given_to_talent", "Total Diberikan ke Talent", Wallet, "number", "right"],
  ["talent_payment_date", "Tanggal Pencairan", CalendarDays, "date", "center"],
  ["pic_2_name", "PIC 2 (HR)", UserRound, "values", "left"],
  ["notes", "Notes", NotebookPen, "text", "left"],
  ["created_at", "Dibuat", CalendarClock, "date", "center"],
];
const SPECS: Record<string, HeaderSpec> = Object.fromEntries(COLS.map(([key, label, icon, kind, align]) => [key, { key, label, icon, kind, align, sortable: true }]));

const CODED: Record<string, { pairs: readonly (readonly [string, string])[]; swatch: Record<string, Swatch> }> = {
  claim_type_code: { pairs: CLAIM_TYPES, swatch: TYPE_SWATCH },
  status_code: { pairs: CLAIM_STATUSES, swatch: STATUS_SWATCH },
  pq_status_code: { pairs: SIMPLE_PROGRESS_STATUSES, swatch: PROGRESS_SWATCH },
  po_status_code: { pairs: SIMPLE_PROGRESS_STATUSES, swatch: PROGRESS_SWATCH },
  cr_status_code: { pairs: SIMPLE_PROGRESS_STATUSES, swatch: PROGRESS_SWATCH },
  billing_status_code: { pairs: BILLING_STATUSES, swatch: PROGRESS_SWATCH },
  talent_payment_status_code: { pairs: TALENT_PAYMENT_STATUSES, swatch: PAYMENT_SWATCH },
};
const MONEY = new Set<string>(MONEY_FIELDS);

function cellText(c: OtClaim, key: string): string {
  if (MONEY.has(key)) return money((c as Record<string, unknown>)[key] as number | null);
  if (key === "created_at") return c.created_at.slice(0, 10);
  return text(c, key);
}

function columns(o: Options): Omit<DataTableColumn<OtClaim>, "header">[] {
  return COLS.map(([key]): Omit<DataTableColumn<OtClaim>, "header"> => {
    if (key === "claim_title") return { key, render: (_, c) => <RecordLink id={c.id}>{c.claim_title}</RecordLink> };
    // Talent and opportunity are picked (V1's selects); the cell shows the name, the editor lists V1's options.
    if (key === "candidate_name") return { key, accessor: (c) => c.employee_id ?? "", format: (_, c) => c.candidate_name ?? "", editor: "select", options: o.employees };
    if (key === "opty_no") return { key, accessor: (c) => c.opportunity_id ?? "", format: (_, c) => c.opty_no ?? "", editor: "select", options: o.opportunities };
    const coded = CODED[key];
    if (coded) {
      return {
        key, type: "status", accessor: (c) => ((c as Record<string, unknown>)[key] as string) || (coded.pairs === SIMPLE_PROGRESS_STATUSES ? "not_started" : ""),
        format: (_, c) => text(c, key), swatches: coded.swatch, editor: "select", options: opts(coded.pairs),
      };
    }
    if (MONEY.has(key)) return { key, type: "number", accessor: (c) => ((c as Record<string, unknown>)[key] as number | null) ?? 0, format: (_, c) => cellText(c, key) };
    return { key, accessor: (c) => cellText(c, key) };
  });
}

function sortValue(c: OtClaim, key: string): unknown {
  if (key === "status_code") return FLOW.indexOf(c.status_code);
  if (key === "claim_month") return (c.start_date ?? c.created_at).slice(0, 7);
  const v = (c as Record<string, unknown>)[key];
  return typeof v === "number" ? v : otFieldValue(c, key);
}

function toolbarColumns(all: OtClaim[]): TableToolbarColumn[] {
  const uniq = (key: string) => Array.from(new Set(all.map((c) => text(c, key)).filter(Boolean))).sort();
  return COLS.map(([key, label, , kind]): TableToolbarColumn => {
    if (CODED[key]) return { key, label, type: "status", values: CODED[key].pairs.map(([, l]) => l) };
    if (kind === "values") return { key, label, type: "select", values: uniq(key) };
    if (kind === "number") return { key, label, type: "number" };
    if (kind === "date") return { key, label, type: "date" };
    return { key, label, type: "text" };
  });
}

/** Cell and panel edits, only for the fields the person's divisions write (V1's split: PMO the claim, Finance the
 *  billing status, HR the payment). */
function edits(roles: Roles): WorkspaceConfig<OtClaim>["edits"] {
  const e: NonNullable<WorkspaceConfig<OtClaim>["edits"]> = {};
  if (roles.pmo) {
    const form = (key: string, field: FormField, required = false) => {
      e[key] = {
        field, required,
        patch: (_, v) => ({ [field]: parseField(field, v) } as Partial<OtClaim>),
        save: (c, v) => ok(updateClaimFields(c.id, claimForm(c, field, v))),
      };
    };
    for (const f of FORM_FIELDS) if (f !== "opportunity_id" && f !== "employee_id") form(f, f, f === "claim_title" || f === "claim_type_code");
    form("candidate_name", "employee_id");
    form("opty_no", "opportunity_id");
  }
  if (roles.finance) {
    e.billing_status_code = {
      field: "billing_status_code", required: true, patch: (_, v) => ({ billing_status_code: v }),
      save: async (c, v) => { if (!c.invoice_no) throw new Error("Input invoice dulu; status penagihan mengikuti invoice."); await ok(updateBillingStatus(c.id, v)); },
    };
  }
  if (roles.hr) {
    e.talent_payment_status_code = { field: "talent_payment_status_code", required: true, patch: (_, v) => ({ talent_payment_status_code: v }), save: (c, v) => ok(updateTalentPayment(c.id, paymentForm(c, { status: v }))) };
    e.amount_total_given_to_talent = { field: "amount_total_given_to_talent", patch: (_, v) => ({ amount_total_given_to_talent: parseField("amount_total_given_to_talent", v) as number | null }), save: (c, v) => ok(updateTalentPayment(c.id, paymentForm(c, { amount: v }))) };
    e.talent_payment_date = { field: "talent_payment_date", patch: (_, v) => ({ talent_payment_date: parseField("talent_payment_date", v) as string | null }), save: (c, v) => ok(updateTalentPayment(c.id, paymentForm(c, { date: v }))) };
  }
  return e;
}

// ── Summary cards: V1's six, each a view ─────────────────────────────────────────────────────────────────────
const KPIS: WorkspaceConfig<OtClaim>["kpis"] = [
  { id: "all", label: "Total Klaim", color: "navy", match: () => true },
  { id: "draft", label: "Draft (PMO)", color: "indigo", match: (c) => c.status_code === "draft" },
  { id: "at_sales", label: "Di Sales", color: "blue", match: (c) => c.status_code === "forwarded_to_sales" },
  { id: "at_finance", label: "Di Finance", color: "purple", match: (c) => c.status_code === "submitted_to_finance" },
  { id: "invoiced", label: "Invoiced", color: "green", match: (c) => c.status_code === "invoiced" },
  { id: "payment_pending", label: "Pencairan Pending", color: "amber", match: (c) => c.talent_payment_status_code === "pending" },
];

function KanbanCard({ c, onOpen }: { c: OtClaim; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="block w-full space-y-1 text-left" data-card-preview={c.id}>
      <span className="block truncate text-[0.8125rem] font-semibold leading-5 text-slate-900">{c.claim_title}</span>
      <span className="block truncate text-[0.75rem] text-slate-500">{[c.candidate_name, c.client_name].filter(Boolean).join(" · ") || "-"}</span>
      <span className="mt-1 flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5 text-[0.6875rem] text-slate-500">
        <span className="truncate">{CLAIM_TYPE_LABELS[c.claim_type_code] ?? c.claim_type_code} · {claimMonth(c)}</span>
        {c.amount_claim_to_client_total ? <span className="shrink-0 tabular-nums">{rupiah(c.amount_claim_to_client_total)}</span> : null}
      </span>
    </button>
  );
}

function rowMenu(roles: Roles) {
  return (c: OtClaim, { open, run }: RowActions): ContextMenuOption[] => {
    const items: ContextMenuOption[] = [{ label: "Buka", onSelect: () => open(c.id) }];
    const next = nextStep(c.status_code);
    if (next && roles[next.division as keyof Roles]) {
      items.push(next.step === "invoice"
        ? { label: next.label, onSelect: () => open(c.id, "invoice") }
        : { label: next.label, onSelect: () => run(c, { status_code: next.to }, () => runStep(c, next.to, roles)) });
    }
    if (roles.hr) items.push({ label: "Update pencairan talent", onSelect: () => open(c.id, "payment") });
    if (roles.pmoFull) items.push({ label: "Hapus klaim", onSelect: () => open(c.id, "delete") });
    return items;
  };
}

function makeConfig(roles: Roles, o: Options): WorkspaceConfig<OtClaim> {
  return {
    title: "Overtime & Business Trip",
    subtitle: "Klaim overtime, business trip dan reimbursement talent: PMO → Sales → Finance, pencairan oleh HR.",
    noun: "klaim",
    searchPlaceholder: "Cari klaim, talent, client, invoice…",
    recordType: "ot_claim",
    storage: { columns: "celerates.salesV2.otClaims.columns", views: "celerates.salesV2.otClaims.savedViews" },
    fieldKeys: OT_FIELD_KEYS,
    fieldValue: otFieldValue,
    sortValue,
    matchesSearch: otMatchesSearch,
    toolbarColumns,
    builtInViews: OT_BUILT_IN_VIEWS,
    kpis: KPIS,
    specs: SPECS,
    columns: columns(o),
    cellText,
    valueOrder: Object.fromEntries(Object.entries(CODED).map(([k, v]) => [k, v.pairs.map(([, l]) => l)])),
    defaultShown: OT_DEFAULT_SHOWN,
    frozen: ["claim_title"],
    rowMenu: rowMenu(roles),
    edits: edits(roles),
    grid: (c) => ({
      label: c.claim_title,
      author: <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-slate-500"><span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: STATUS_ACCENT[c.status_code] }} />{CLAIM_STATUS_LABELS[c.status_code]}</span>,
      title: c.claim_title,
      excerpt: [CLAIM_TYPE_LABELS[c.claim_type_code], c.candidate_name, c.client_name].filter(Boolean).join(" · "),
      footer: <span className="text-[0.75rem] text-slate-500">{money(c.amount_claim_to_client_total) || "Belum ada nominal"} · Pencairan {PAYMENT_LABELS[c.talent_payment_status_code]}</span>,
      date: c.start_date ?? undefined,
    }),
    // Board by flow status. A move is that step's V1 action, by its division; Invoiced asks for the invoice first.
    board: {
      stages: CLAIM_STATUSES.map(([id, title]) => ({ id, title, accent: STATUS_ACCENT[id] })),
      stageOf: (c) => c.status_code,
      withStage: (_, to) => ({ status_code: to }),
      move: (c, to) => runStep(c, to, roles),
      restore: () => Promise.reject(new Error("Alur klaim hanya maju; langkah yang sudah dikirim tidak bisa dibatalkan.")),
      confirm: new Set(["invoiced"]),
      recordLabel: (c) => c.claim_no,
      cardLabel: (c) => c.claim_title,
      renderCard: (c, open) => <KanbanCard c={c} onOpen={open} />,
    },
  };
}

type Props = { records: OtClaim[]; access: Access; roles: Roles; options: Options };

export function OtClaimsWorkspace({ records, access, roles, options }: Props) {
  const config = useMemo(() => makeConfig(roles, options), [roles, options]);
  const [creating, setCreating] = useState(false);
  return (
    <SnackbarProvider>
      <RecordWorkspace
        config={config}
        records={records}
        access={access}
        headerEnd={<Link href="/pmo/overtime-business-trip" className="text-[0.75rem] text-slate-400 hover:text-slate-700 hover:underline" title="Tampilan lama (V1)">Versi lama</Link>}
        toolbarEnd={roles.pmo ? <Button size="sm" intent="primary" onClick={() => setCreating(true)} data-ot-create><Plus size={14} /> Klaim baru</Button> : undefined}
        renderPanel={(p) => <ClaimPanel ctx={p} roles={roles} />}
        renderMoveDialog={(m) => <InvoiceDialog move={m} roles={roles} />}
      />
      <CreateClaimDialog open={creating} onClose={() => setCreating(false)} options={options} />
    </SnackbarProvider>
  );
}

// ── Dialogs: V1's forms, V1's actions ─────────────────────────────────────────────────────────────────────────
function CreateClaimDialog({ open, onClose, options }: { open: boolean; onClose: () => void; options: Options }) {
  const { pending, onSubmit, t } = useSubmit(createClaim, onClose);
  const onOpenChange = useCloseFromXOnly(open, onClose);
  const [formKey, setFormKey] = useState(0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Klaim baru" closeLabel="Tutup" width={720} data-sales-v2-dialog="ot-create">
      <form key={formKey} onSubmit={onSubmit}>
        <DialogBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <F label="Tipe klaim" required><Select name="claim_type_code" required options={opts(CLAIM_TYPES)} placeholder="Pilih tipe" /></F>
            <div className="sm:col-span-2"><F label="Judul klaim" required><Input name="claim_title" required placeholder="mis. Lembur rilis Oktober" /></F></div>
            <div className="sm:col-span-2"><F label="Opportunity / Project"><Select name="opportunity_id" searchable options={options.opportunities} placeholder="Pilih" /></F></div>
            <F label="Talent"><Select name="employee_id" searchable options={options.employees} placeholder="Pilih" /></F>
            <F label="Start Date"><Input name="start_date" type="date" /></F>
            <F label="End Date"><Input name="end_date" type="date" /></F>
            <F label="Jumlah Hari"><Input name="days_count" type="number" min={0} /></F>
            <F label="Total Claim ke Client"><Money name="amount_claim_to_client_total" /></F>
            <F label="Pencairan ke Talent"><Money name="amount_given_to_talent_initial" /></F>
            <F label="PIC 1 (PMO)" hint="Kosong: nama Anda"><Input name="pic_1_name" /></F>
            <F label="Notes" span><Textarea name="notes" rows={3} /></F>
          </div>
          <p className="mt-3 text-[0.75rem] text-slate-500">Durasi, link SPK/timesheet, status PQ/PO/CR dan nominal lain diisi di tabel atau panel setelah klaim dibuat.</p>
        </DialogBody>
        <DraftFooter pending={pending} onCancel={onClose} onReset={() => setFormKey((k) => k + 1)} t={t} />
      </form>
    </Dialog>
  );
}

function InvoiceForm({ claim, onCancel, onSave }: { claim: OtClaim; onCancel: () => void; onSave: (fd: FormData) => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      setPending(true); setError(null);
      try { await onSave(fd); } catch (err) { setError((err as Error)?.message || "Gagal menyimpan"); } finally { setPending(false); }
    }}>
      <DialogBody>
        <p className="mb-3 text-[0.8125rem] text-slate-600">{claim.claim_no} · {claim.claim_title}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Nomor invoice" required><Input name="invoice_no" required autoFocus /></F>
          <F label="Ditagih ke client" hint={claim.amount_claim_to_client_total ? `Total claim: ${rupiah(claim.amount_claim_to_client_total)}` : undefined}><Money name="amount_total_billed_to_client" defaultValue={claim.amount_claim_to_client_total?.toString()} /></F>
        </div>
        {error && <p className="mt-2 text-[0.75rem] text-red-600">{error}</p>}
      </DialogBody>
      <DialogFooter>
        <Button type="button" size="sm" intent="neutral" onClick={onCancel} disabled={pending}>Batal</Button>
        <Button type="submit" size="sm" intent="primary" loading={pending}>Tandai Invoiced</Button>
      </DialogFooter>
    </form>
  );
}

/** A board move into Invoiced: the invoice first (V1's markInvoiced needs its number). */
function InvoiceDialog({ move, roles }: { move: MoveContext<OtClaim>; roles: Roles }) {
  const m = move.move;
  const check = m ? flowMove(m.record.status_code, m.to) : null;
  const refused = check && "error" in check ? check.error : m && !roles.finance ? "Input invoice dilakukan Finance." : null;
  return (
    <Dialog open={!!m} onOpenChange={(o) => !o && move.onCancel()} title="Input invoice" closeLabel="Tutup" width={520} data-sales-v2-dialog="ot-invoice">
      {m && (refused ? (
        <>
          <DialogBody><p className="text-[0.8125rem] text-slate-700">{refused}</p></DialogBody>
          <DialogFooter><Button size="sm" intent="neutral" onClick={move.onCancel}>Tutup</Button></DialogFooter>
        </>
      ) : (
        <InvoiceForm claim={m.record} onCancel={move.onCancel} onSave={async (fd) => { await runStep(m.record, "invoiced", roles, fd); move.onMoved(); }} />
      ))}
    </Dialog>
  );
}

// ── Record panel ──────────────────────────────────────────────────────────────────────────────────────────────
type PanelDialog = "invoice" | "payment" | "delete" | null;

function ClaimPanel({ ctx, roles }: { ctx: PanelContext<OtClaim>; roles: Roles }) {
  const { record, records, select, close, request, clearRequest } = ctx;
  const { run, showHistory } = useRowActions();
  const { showToast } = useToast();
  const [dialog, setDialog] = useState<PanelDialog>(null);
  const wrapRef = useRecordPanelRail(record ? { type: "ot_claim", id: record.id, label: record.claim_title } : null, close, !!dialog);
  useEffect(() => {
    if (!request || !record || request.id !== record.id) return;
    setDialog(request.action as PanelDialog);
    clearRequest();
  }, [request, record, clearRequest]);
  if (!record) return <div ref={wrapRef} hidden />;
  const c = record;
  const index = records.findIndex((r) => r.id === c.id);
  const next = nextStep(c.status_code);
  const mine = next && roles[next.division as keyof Roles];
  const done = (msg: string) => { setDialog(null); showToast(msg); };

  const rows = (pairs: [string, React.ReactNode][]) => (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-[0.8125rem]">
      {pairs.map(([k, v]) => <div key={k} className="contents"><dt className="text-slate-500">{k}</dt><dd className="text-right tabular-nums text-slate-800">{v || "-"}</dd></div>)}
    </dl>
  );
  const link = (url: string | null) => (url ? <a href={url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">Buka ↗</a> : "-");

  const filled = (vals: unknown[]) => vals.filter((v) => v != null && v !== "" && v !== 0).length;
  const highlights = [
    { key: "status", label: "Status Alur", value: <span className="font-semibold">{CLAIM_STATUS_LABELS[c.status_code] ?? c.status_code}</span> },
    { key: "type", label: "Tipe", value: CLAIM_TYPE_LABELS[c.claim_type_code] ?? c.claim_type_code },
    { key: "talent", label: "Talent", value: c.candidate_name ? `${c.candidate_name}${c.employee_no ? ` (${c.employee_no})` : ""}` : "-" },
    { key: "client", label: "Client / Project", value: [c.client_name, c.project_name].filter(Boolean).join(" · ") || "-" },
    { key: "period", label: "Periode", value: [c.start_date, c.end_date].filter(Boolean).join(" – ") + (c.days_count ? ` · ${c.days_count} hari` : "") || "-" },
    { key: "claim", label: "Total claim ke client", value: money(c.amount_claim_to_client_total) || "-" },
    { key: "pay", label: "Pencairan talent", value: PAYMENT_LABELS[c.talent_payment_status_code] ?? c.talent_payment_status_code },
  ];
  const sections = [
    {
      key: "amounts", label: "Nominal",
      count: filled([c.amount_given_to_talent_initial, c.amount_claim_to_client_total, c.amount_bt_medical_to_client, c.amount_uang_saku_celerates, c.amount_transport, c.amount_over_bagasi, c.amount_etc]),
      content: rows([
        ["Pencairan ke talent (awal)", money(c.amount_given_to_talent_initial)], ["Total claim ke client", money(c.amount_claim_to_client_total)],
        ["BT/Medical ke client", money(c.amount_bt_medical_to_client)], ["Uang saku Celerates", money(c.amount_uang_saku_celerates)],
        ["Transport", money(c.amount_transport)], ["Over bagasi", money(c.amount_over_bagasi)], ["Etc", money(c.amount_etc)],
      ]),
    },
    {
      key: "docs", label: "Durasi & dokumen",
      count: filled([c.duration_hours_client, c.duration_hours_pmo_basic, c.duration_hours_payroll, c.spk_url, c.timesheet_url, c.draft_timesheet_url, c.pq_submit_date]),
      content: rows([
        ["Durasi ke client", c.duration_hours_client != null ? `${c.duration_hours_client} jam` : ""], ["Basic durasi PMO", c.duration_hours_pmo_basic != null ? `${c.duration_hours_pmo_basic} jam` : ""],
        ["Durasi payroll", c.duration_hours_payroll != null ? `${c.duration_hours_payroll} jam` : ""],
        ["SPK", link(c.spk_url)], ["Timesheet", link(c.timesheet_url)], ["Draft timesheet", link(c.draft_timesheet_url)],
        ["PQ submit", c.pq_submit_date], ["PQ / PO / CR", [c.pq_status_code, c.po_status_code, c.cr_status_code].map((s) => PROGRESS_LABELS[s ?? "not_started"]).join(" / ")],
        ["PIC 1 (PMO)", c.pic_1_name],
      ]),
    },
    {
      key: "invoice", label: "Invoice (Finance)", count: c.invoice_no ? 1 : 0,
      content: rows([["Invoice no", c.invoice_no], ["Ditagih ke client", money(c.amount_total_billed_to_client)], ["Status penagihan", BILLING_LABELS[c.billing_status_code] ?? c.billing_status_code]]),
    },
    {
      key: "payment", label: "Pencairan talent (HR)", count: c.talent_payment_status_code === "done" ? 1 : 0,
      content: (
        <div className="space-y-2">
          {rows([["Status", PAYMENT_LABELS[c.talent_payment_status_code]], ["Total diberikan", money(c.amount_total_given_to_talent)], ["Tanggal", c.talent_payment_date], ["PIC 2 (HR)", c.pic_2_name]])}
          {roles.hr && <Button size="sm" intent="neutral" onClick={() => setDialog("payment")}>Update pencairan</Button>}
        </div>
      ),
    },
    { key: "notes", label: "Notes", count: c.notes ? 1 : 0, content: c.notes ? <p className="whitespace-pre-wrap text-[0.8125rem] text-slate-700">{c.notes}</p> : undefined },
  ];
  const footer = (
    <div className="flex flex-wrap items-center gap-2">
      {next && mine && (next.step === "invoice"
        ? <Button size="sm" intent="primary" onClick={() => setDialog("invoice")}><Receipt size={14} /> {next.label}</Button>
        : <Button size="sm" intent="primary" onClick={() => run(c, { status_code: next.to }, async () => { await runStep(c, next.to, roles); showToast(`${c.claim_no}: ${next.label} terkirim`); })}><ArrowRight size={14} /> {next.label}</Button>)}
      {next && !mine && <span className="text-[0.75rem] text-slate-500">Menunggu {DIVISION[next.division]}: {next.label.toLowerCase()}.</span>}
      {!next && <span className="text-[0.75rem] text-slate-500">Alur selesai: sudah diinvoice.</span>}
      {roles.pmoFull && <Button size="sm" intent="ghost" className="ml-auto" onClick={() => setDialog("delete")} aria-label="Hapus klaim"><Trash2 size={14} /></Button>}
    </div>
  );

  return (
    <>
      <div ref={wrapRef} hidden />
      <RecordPanel
        record={{ id: c.id, name: c.claim_title } as never}
        title={<PanelTitle name={c.claim_title} prefill={`Tentang klaim ${c.claim_no} (${c.claim_title}): `} />}
        counterLabel={index >= 0 ? `${index + 1} dari ${records.length}` : undefined}
        onPrevious={index > 0 ? () => select(records[index - 1].id) : undefined}
        onNext={index >= 0 && index < records.length - 1 ? () => select(records[index + 1].id) : undefined}
        previousRecordLabel="Sebelumnya"
        nextRecordLabel="Berikutnya"
        closeLabel="Tutup"
        highlightsLabel={c.claim_no}
        highlights={highlights}
        activityLabel="Aktivitas"
        activity={<RecordTimeline recordId={c.id} version={c} empty="Belum ada perubahan yang tercatat." />}
        viewAllActivityLabel="Riwayat lengkap"
        onViewAllActivity={() => showHistory(c.id)}
        sections={sections}
        footer={footer}
        resizable
        defaultWidth={440}
        minWidth={360}
        maxWidth={720}
        onClose={close}
        data-testid="sales-v2-record-panel"
      />
      <Dialog open={dialog === "invoice"} onOpenChange={(o) => !o && setDialog(null)} title="Input invoice" closeLabel="Tutup" width={520} data-sales-v2-dialog="ot-invoice">
        {dialog === "invoice" && <InvoiceForm claim={c} onCancel={() => setDialog(null)} onSave={async (fd) => { await runStep(c, "invoiced", roles, fd); done(`${c.claim_no} ditandai Invoiced`); }} />}
      </Dialog>
      <Dialog open={dialog === "payment"} onOpenChange={(o) => !o && setDialog(null)} title="Pencairan talent" closeLabel="Tutup" width={520} data-sales-v2-dialog="ot-payment">
        {dialog === "payment" && <PaymentForm claim={c} onCancel={() => setDialog(null)} onSaved={() => done("Pencairan talent disimpan")} />}
      </Dialog>
      <Dialog open={dialog === "delete"} onOpenChange={(o) => !o && setDialog(null)} title="Hapus klaim?" closeLabel="Tutup" width={440} data-sales-v2-dialog="ot-delete">
        {dialog === "delete" && <DeleteForm claim={c} onCancel={() => setDialog(null)} onDeleted={() => { setDialog(null); close(); showToast(`${c.claim_no} dihapus`); }} />}
      </Dialog>
    </>
  );
}

function PaymentForm({ claim, onCancel, onSaved }: { claim: OtClaim; onCancel: () => void; onSaved: () => void }) {
  const { run } = useRowActions();
  const [status, setStatus] = useState(claim.talent_payment_status_code);
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      fd.set("talent_payment_status_code", status);
      run(claim, { talent_payment_status_code: status }, () => ok(updateTalentPayment(claim.id, fd)));
      onSaved();
    }}>
      <DialogBody>
        <div className="grid gap-3 sm:grid-cols-3">
          <F label="Status"><Select value={status} onValueChange={setStatus} options={opts(TALENT_PAYMENT_STATUSES)} /></F>
          <F label="Total diberikan"><Money name="amount_total_given_to_talent" defaultValue={claim.amount_total_given_to_talent?.toString()} /></F>
          <F label="Tanggal"><Input name="talent_payment_date" type="date" defaultValue={claim.talent_payment_date ?? ""} /></F>
        </div>
        <p className="mt-2 text-[0.75rem] text-slate-500">Status Done memberi tahu PMO.</p>
      </DialogBody>
      <DialogFooter>
        <Button type="button" size="sm" intent="neutral" onClick={onCancel}>Batal</Button>
        <Button type="submit" size="sm" intent="primary">Simpan</Button>
      </DialogFooter>
    </form>
  );
}

function DeleteForm({ claim, onCancel, onDeleted }: { claim: OtClaim; onCancel: () => void; onDeleted: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <DialogBody>
        <p className="text-[0.8125rem] text-slate-700">{claim.claim_no} · {claim.claim_title} dihapus permanen, termasuk status invoice dan pencairannya.</p>
        {error && <p className="mt-2 text-[0.75rem] text-red-600">{error}</p>}
      </DialogBody>
      <DialogFooter>
        <Button size="sm" intent="neutral" onClick={onCancel} disabled={pending}>Batal</Button>
        <Button size="sm" intent="danger" loading={pending} onClick={async () => {
          setPending(true); setError(null);
          try { await ok(deleteClaim(claim.id)); onDeleted(); } catch (err) { setError((err as Error)?.message || "Gagal menghapus"); } finally { setPending(false); }
        }}>Hapus</Button>
      </DialogFooter>
    </>
  );
}

