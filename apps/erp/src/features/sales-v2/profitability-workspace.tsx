"use client";
// Sales V2 Profitability Tracker: the shared record workspace (record-workspace.tsx) over one period's
// profitability_entries, with V1's totals, thresholds and charts. The one write is V1's syncProfitabilityFromTalents,
// so V1 (/sales/profitability-tracker) and V2 always show the same data. Parity list:
// docs/design/SALES-V2-TAB-MIGRATION.md §Profitability Tracker.
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Banknote, BarChart3, Briefcase, Building2, CalendarClock, ChevronLeft, ChevronRight, CircleDot, Percent, RefreshCw, Receipt, UserRound, Wallet } from "lucide-react";
import {
  Button, Dialog, DialogBody, RecordPanel, SnackbarProvider, Tooltip, type ContextMenuOption, type DataTableColumn, type TableToolbarColumn,
} from "@crisp-ui-kit/crisp";
import { useToast } from "@/components/toast-provider";
import { BarChart } from "@/components/dashboard-charts";
import { syncProfitabilityFromTalents } from "@/app/sales/profitability-tracker/actions";
import { RecordLink } from "./cells";
import type { HeaderSpec } from "./header-filter";
import { RecordTimeline } from "./history";
import { PanelTitle, RecordWorkspace, useRecordPanelRail, useRowActions, type Access, type PanelContext, type RowActions, type WorkspaceConfig } from "./record-workspace";
import { rupiah } from "./model";
import {
  BANDS, BAND_LABEL, PROFIT_BUILT_IN_VIEWS, PROFIT_DEFAULT_SHOWN, PROFIT_FIELD_KEYS, bandOf, marginBy, parsePeriod, periodKey, periodLabel,
  profitFieldValue, profitMatchesSearch, shiftPeriod, totals, type Period, type ProfitRow,
} from "./profitability-model";

const SWATCH = Object.fromEntries(BANDS.map((b) => [b.id, b.swatch])) as Record<string, 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12>;
const pct = (n: number) => `${n.toFixed(1)}%`;
const day = (iso: string) => iso.slice(0, 10);
const marginTone = (n: number) => (n < 0 ? "text-red-600" : "text-emerald-700");

function sortValue(r: ProfitRow, key: string): unknown {
  if (key === "band") return BANDS.findIndex((b) => b.id === bandOf(r.marginPct));
  return profitFieldValue(r, key);
}

function toolbarColumns(all: ProfitRow[]): TableToolbarColumn[] {
  const uniq = (xs: (string | null)[]) => Array.from(new Set(xs.filter((v): v is string => !!v))).sort();
  return [
    { key: "talent", label: "Talent", type: "text" },
    { key: "client", label: "Client", type: "select", values: uniq(all.map((r) => r.client)) },
    { key: "role", label: "Role", type: "select", values: uniq(all.map((r) => r.role)) },
    { key: "band", label: "Kategori margin", type: "status", values: BANDS.map((b) => b.title) },
    { key: "price", label: "Price / bulan", type: "number" },
    { key: "cogs", label: "COGS / bulan", type: "number" },
    { key: "margin", label: "Margin (Rp)", type: "number" },
    { key: "marginPct", label: "Margin (%)", type: "number" },
    { key: "syncedBy", label: "Disinkron oleh", type: "select", values: uniq(all.map((r) => r.syncedBy)) },
    { key: "syncedAt", label: "Disinkron", type: "date" },
  ];
}

type Props = { records: ProfitRow[]; access: Access; period: Period };

export function ProfitabilityWorkspace({ records, access, period }: Props) {
  return (
    <SnackbarProvider>
      <RecordWorkspace
        config={CONFIG}
        records={records}
        access={access}
        headerEnd={<Link href={`/sales/profitability-tracker?year=${period.year}&month=${period.month}`} className="text-[0.75rem] text-slate-400 hover:text-slate-700 hover:underline" title="Tampilan lama (V1)">Versi lama</Link>}
        toolbarEnd={<PeriodTools records={records} access={access} period={period} />}
        renderPanel={(p) => <ProfitPanel ctx={p} period={period} />}
        renderMoveDialog={() => null}
      />
    </SnackbarProvider>
  );
}

// ── Period, charts and sync: V1's header controls ─────────────────────────────────────────────────────────────
function PeriodTools({ records, access, period }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { showToast } = useToast();
  const [charts, setCharts] = useState(false);
  const [syncing, start] = useTransition();
  const current = parsePeriod(null);
  const go = (p: Period) => {
    const q = new URLSearchParams(params.toString());
    q.delete("record");
    if (periodKey(p) === periodKey(current)) q.delete("period"); else q.set("period", periodKey(p));
    router.push(`${pathname}${q.size ? `?${q}` : ""}`);
  };
  const sync = () => start(async () => {
    const res = await syncProfitabilityFromTalents(period.year, period.month);
    if (!res.ok) return showToast(res.error, "error");
    showToast(`${res.data.synced} talent disinkron untuk ${periodLabel(period)}${res.data.skipped ? `; ${res.data.skipped} dilewati (belum ada COGS atau client)` : ""}.`);
    router.refresh();
  });

  return (
    <>
      <span className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 px-0.5" data-profit-period={periodKey(period)}>
        <Tooltip content="Bulan sebelumnya"><Button size="sm" intent="ghost" aria-label="Bulan sebelumnya" onClick={() => go(shiftPeriod(period, -1))}><ChevronLeft size={14} /></Button></Tooltip>
        <span className="min-w-[7.5rem] text-center text-[0.75rem] font-medium text-slate-700">{periodLabel(period)}</span>
        <Tooltip content="Bulan berikutnya"><Button size="sm" intent="ghost" aria-label="Bulan berikutnya" onClick={() => go(shiftPeriod(period, 1))}><ChevronRight size={14} /></Button></Tooltip>
      </span>
      {records.length === 0 && <span className="text-[0.75rem] text-slate-500" data-profit-empty>Belum disinkron{access.canEdit ? "; klik Sync" : ""}</span>}
      {periodKey(period) !== periodKey(current) && <Button size="sm" intent="ghost" onClick={() => go(current)}>Bulan ini</Button>}
      <Tooltip content="Grafik margin per client dan role"><Button size="sm" intent="ghost" aria-label="Grafik" onClick={() => setCharts(true)}><BarChart3 size={14} /></Button></Tooltip>
      {access.canEdit && (
        <Button size="sm" intent="primary" onClick={sync} disabled={syncing} data-profit-sync>
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> {syncing ? "Sinkron…" : "Sync dari Talents Book"}
        </Button>
      )}
      <Dialog open={charts} onOpenChange={setCharts} title={`Margin ${periodLabel(period)}`} closeLabel="Tutup" width={720}>
        <DialogBody>
          {records.length === 0 ? <p className="text-slate-500">Belum ada data untuk periode ini.</p> : (
            <div className="grid gap-6 md:grid-cols-2">
              <figure>
                <figcaption className="mb-2 text-[0.8125rem] font-semibold text-slate-800">Margin per Client <span className="font-normal text-slate-500">(juta, top 8)</span></figcaption>
                <BarChart items={marginBy(records, (r) => r.client)} />
              </figure>
              <figure>
                <figcaption className="mb-2 text-[0.8125rem] font-semibold text-slate-800">Margin per Role <span className="font-normal text-slate-500">(juta, top 8)</span></figcaption>
                <BarChart items={marginBy(records, (r) => r.role ?? "Lainnya")} />
              </figure>
            </div>
          )}
        </DialogBody>
      </Dialog>
    </>
  );
}

// ── Summary cards: V1's four figures, plus the rows below V1's 15 % threshold ─────────────────────────────────
const KPIS: WorkspaceConfig<ProfitRow>["kpis"] = [
  { id: "price", label: "Total Price", color: "navy", value: (all) => rupiah(totals(all).price) },
  { id: "cogs", label: "Total COGS", color: "orange", value: (all) => rupiah(totals(all).cogs) },
  { id: "margin", label: "Total Margin", color: "green", value: (all) => rupiah(totals(all).margin) },
  { id: "pct", label: "Rata-rata Margin", color: "blue", value: (all) => pct(totals(all).pct) },
  { id: "low", label: "Margin < 15%", color: "red", match: (r) => r.marginPct < 15 },
];

function KanbanCard({ r, onOpen }: { r: ProfitRow; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="block w-full space-y-1 text-left" data-card-preview={r.id}>
      <span className="block truncate text-[0.8125rem] font-semibold leading-5 text-slate-900">{r.talent}</span>
      <span className="block truncate text-[0.75rem] text-slate-500">{[r.client, r.role].filter(Boolean).join(" · ")}</span>
      <span className="mt-1 flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5 text-[0.6875rem] tabular-nums">
        <span className={marginTone(r.margin)}>{rupiah(r.margin)}</span>
        <span className="font-semibold text-slate-700">{pct(r.marginPct)}</span>
      </span>
    </button>
  );
}

// ── Table columns: V1's, talent pinned as V1 did ──────────────────────────────────────────────────────────────
const SPECS: Record<string, HeaderSpec> = Object.fromEntries(([
  ["talent", "Talent", UserRound, "values", "left"],
  ["client", "Client", Building2, "values", "left"],
  ["role", "Role", Briefcase, "values", "left"],
  ["price", "Price / bulan", Banknote, "number", "right"],
  ["cogs", "COGS / bulan", Receipt, "number", "right"],
  ["margin", "Margin (Rp)", Wallet, "number", "right"],
  ["marginPct", "Margin (%)", Percent, "number", "center"],
  ["band", "Kategori margin", CircleDot, "values", "center"],
  ["syncedBy", "Disinkron oleh", UserRound, "values", "left"],
  ["syncedAt", "Disinkron", CalendarClock, "date", "center"],
] as const).map(([key, label, icon, kind, align]) => [key, { key, label, icon, kind, align, sortable: true }]));

// Footer calculations (Attio's): sums of the shown rows, so a filtered table totals what it shows.
const money = (n: number) => rupiah(Math.round(n));
const COLUMNS: Omit<DataTableColumn<ProfitRow>, "header">[] = [
  { key: "talent", render: (_, r) => <RecordLink id={r.id}>{r.talent}</RecordLink> },
  { key: "client", accessor: (r) => r.client },
  { key: "role", accessor: (r) => r.role ?? "" },
  { key: "price", type: "number", accessor: (r) => r.price, format: (_, r) => rupiah(r.price), summary: (rows) => money(totals(rows).price) },
  { key: "cogs", type: "number", accessor: (r) => r.cogs, format: (_, r) => rupiah(r.cogs), summary: (rows) => money(totals(rows).cogs) },
  { key: "margin", type: "number", accessor: (r) => r.margin, render: (_, r) => <span className={`font-medium tabular-nums ${marginTone(r.margin)}`}>{rupiah(r.margin)}</span>, summary: (rows) => money(totals(rows).margin) },
  { key: "marginPct", type: "status", accessor: (r) => bandOf(r.marginPct), format: (_, r) => pct(r.marginPct), swatches: SWATCH, summary: (rows) => pct(totals(rows).pct) },
  { key: "band", type: "status", accessor: (r) => bandOf(r.marginPct), format: (_, r) => BAND_LABEL[bandOf(r.marginPct)], swatches: SWATCH },
  { key: "syncedBy", accessor: (r) => r.syncedBy },
  { key: "syncedAt", accessor: (r) => day(r.syncedAt) },
];

function cellText(r: ProfitRow, key: string): string {
  if (key === "price" || key === "cogs" || key === "margin") return rupiah(r[key]);
  if (key === "marginPct") return pct(r.marginPct);
  if (key === "syncedAt") return day(r.syncedAt);
  return String(profitFieldValue(r, key) ?? "");
}

const rowMenu = (r: ProfitRow, { open }: RowActions): ContextMenuOption[] => [{ label: "Buka", onSelect: () => open(r.id) }];

const CONFIG: WorkspaceConfig<ProfitRow> = {
  title: "Profitability Tracker",
  subtitle: "Price, COGS dan margin per talent per bulan, dari Talents Book dan COGS Calculator.",
  noun: "talent",
  searchPlaceholder: "Cari talent, client, role…",
  recordType: "profitability_entry",
  storage: { columns: "celerates.salesV2.profitability.columns", views: "celerates.salesV2.profitability.savedViews" },
  fieldKeys: PROFIT_FIELD_KEYS,
  fieldValue: profitFieldValue,
  sortValue,
  matchesSearch: profitMatchesSearch,
  toolbarColumns,
  builtInViews: PROFIT_BUILT_IN_VIEWS,
  kpis: KPIS,
  specs: SPECS,
  columns: COLUMNS,
  cellText,
  valueOrder: { band: BANDS.map((b) => b.title) },
  defaultShown: PROFIT_DEFAULT_SHOWN,
  frozen: ["talent"],
  rowMenu,
  keepParams: ["period"],
  grid: (r) => ({
    label: r.talent,
    author: <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-slate-500"><span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: BANDS.find((b) => b.id === bandOf(r.marginPct))?.accent }} />{pct(r.marginPct)}</span>,
    title: r.talent,
    excerpt: [r.client, r.role].filter(Boolean).join(" · "),
    footer: <span className="text-[0.75rem] text-slate-500">Price {rupiah(r.price)} · COGS {rupiah(r.cogs)} · <span className={marginTone(r.margin)}>Margin {rupiah(r.margin)}</span></span>,
  }),
  // Board by margin band. The band follows from the synced figures, so cards do not move.
  board: {
    stages: BANDS,
    stageOf: (r) => bandOf(r.marginPct),
    withStage: () => ({}),
    move: () => Promise.reject(new Error("Margin dihitung dari Talents Book; ubah datanya di sana lalu Sync.")),
    confirm: new Set(),
    readOnly: true,
    recordLabel: (r) => r.talent,
    cardLabel: (r) => r.talent,
    renderCard: (r, open) => <KanbanCard r={r} onOpen={open} />,
  },
};

// ── Record panel ──────────────────────────────────────────────────────────────────────────────────────────────
function ProfitPanel({ ctx, period }: { ctx: PanelContext<ProfitRow>; period: Period }) {
  const { record, records, select, close } = ctx;
  const { showHistory } = useRowActions();
  const wrapRef = useRecordPanelRail(record ? { type: "profitability_entry", id: record.id, label: record.talent } : null, close, false);
  if (!record) return <div ref={wrapRef} hidden />;
  const index = records.findIndex((r) => r.id === record.id);

  const highlights = [
    { key: "pct", label: "Margin (%)", value: <span className="font-semibold">{pct(record.marginPct)} · {BAND_LABEL[bandOf(record.marginPct)]}</span> },
    { key: "margin", label: "Margin", value: <span className={marginTone(record.margin)}>{rupiah(record.margin)}</span> },
    { key: "price", label: "Price / bulan", value: rupiah(record.price) },
    { key: "cogs", label: "COGS / bulan", value: rupiah(record.cogs) },
    { key: "client", label: "Client", value: record.client },
    { key: "role", label: "Role", value: record.role ?? "-" },
    { key: "synced", label: "Disinkron", value: `${record.syncedBy} · ${day(record.syncedAt)}` },
  ];
  const sections = [{
    key: "trend", label: "Margin bulan lain", count: record.trend.length,
    content: record.trend.length ? (
      <ul className="space-y-1 text-[0.8125rem]">
        {record.trend.map((t) => (
          <li key={t.period} className="flex items-center justify-between gap-3 tabular-nums">
            <span className="text-slate-600">{periodLabel(parsePeriod(t.period))}</span>
            <span><span className={marginTone(t.margin)}>{rupiah(t.margin)}</span> <span className="ml-2 font-medium text-slate-700">{pct(t.marginPct)}</span></span>
          </li>
        ))}
      </ul>
    ) : undefined,
  }];

  return (
    <>
      <div ref={wrapRef} hidden />
      <RecordPanel
        record={{ id: record.id, name: record.talent } as never}
        title={<PanelTitle name={record.talent} prefill={`Tentang margin ${record.talent} di ${record.client} (${periodLabel(period)}): `} />}
        counterLabel={index >= 0 ? `${index + 1} dari ${records.length}` : undefined}
        onPrevious={index > 0 ? () => select(records[index - 1].id) : undefined}
        onNext={index >= 0 && index < records.length - 1 ? () => select(records[index + 1].id) : undefined}
        previousRecordLabel="Sebelumnya"
        nextRecordLabel="Berikutnya"
        closeLabel="Tutup"
        highlightsLabel="Ringkasan"
        highlights={highlights}
        activityLabel="Perubahan saat Sync"
        activity={<RecordTimeline recordId={record.id} version={record} empty="Belum ada perubahan dari Sync ulang periode ini." />}
        viewAllActivityLabel="Riwayat lengkap"
        onViewAllActivity={() => showHistory(record.id)}
        sections={sections}
        footer={<p className="text-[0.75rem] text-slate-500">Angka dihitung dari Talents Book dan COGS Calculator. Ubah di sana, lalu Sync.</p>}
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
