"use client";
// Sales V2 Opportunity workspace: one record set, one state (in the URL), three views (Tabel · Grid · Kanban) and a
// read-first preview. docs/design/SALES-V2-CRISP-UX-CONTRACT.md is the contract this file implements.
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck, Banknote, Briefcase, Building2, CalendarClock, CircleDot, CircleX, Columns3, FileText, Gauge, GitBranch, HandCoins, Hash,
  LayoutGrid, Layers, Megaphone, NotebookPen, RefreshCw, Search, Signal, Table2, Tag, Timer, UserRound, Users,
} from "lucide-react";
import {
  Board, DataTable, EntityCard, Input, SavedViews, SavedViewsSaveBar, SnackbarProvider, StatCard, TableToolbar, ViewToggle, useSnackbar,
  applyFilters, applySorts, Button, Dialog, DialogBody, DialogFooter, FormField,
  type DataTableColumn, type TableToolbarColumn,
} from "@crisp-ui-kit/crisp";
import { useToast } from "@/components/toast-provider";
import { updateOptyStatus } from "@/app/sales/opportunity-tracker/actions";
import { CreateMenu, type CreateRequest, type FormOptions } from "./forms";
import { HeaderFilter, type HeaderSpec } from "./header-filter";
import { CONFIRM_STAGES, StageMoveDialog, type PendingMove } from "./stage-move";
import { RecordPreview, type Access } from "./record-preview";
import {
  BUILT_IN_VIEWS, CLIENT_TYPES, DEFAULT_SHOWN, FIELD_KEYS, LEVELS, SERVICE_TYPES, STAGES, STAGE_LABEL, SERVICE_LABEL, LEVEL_LABEL, CLIENT_TYPE_LABEL,
  daysSince, fieldValue, matchesSearch, parseState, rupiah, serializeState,
  type Opportunity, type SavedState, type StoredView, type View, type WorkspaceState,
} from "./model";

const COLUMNS_KEY = "celerates.salesV2.columns";
const VIEWS_KEY = "celerates.salesV2.savedViews";
const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s.id, i]));
// Stage cells carry the stage's position ("0".."5") so the table sorts in pipeline order, shown as its label.
const STAGE_SWATCH = Object.fromEntries(STAGES.map((s, i) => [String(i), s.swatch])) as Record<string, 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12>;

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStorage(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: preference not kept */ }
}

/**
 * Pixel height of an element. Crisp DataTable applies `height` to its inner scroll box, whose parent has no height of
 * its own, so "100%" does not bound it; a measured number does (and turns on row virtualization).
 */
function useHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [h, setH] = useState(480);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(Math.max(240, Math.floor(el.clientHeight))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, h] as const;
}

/** Sort reads stage order for Stage and raw numbers for amounts; everything else as displayed. */
function sortValue(o: Opportunity, key: string): unknown {
  if (key === "status") return STAGE_ORDER[o.status] ?? 99;
  if (key === "converted") return o.pq ? 1 : 0;
  return fieldValue(o, key);
}

type WorkspaceProps = { records: Opportunity[]; access: Access; options: FormOptions };

/** Crisp's Snackbar (Undo after a Kanban move) needs its provider above the workspace. */
export function OpportunityWorkspace(props: WorkspaceProps) {
  return (
    <SnackbarProvider>
      <Workspace {...props} />
    </SnackbarProvider>
  );
}

function Workspace({ records: serverRecords, access, options }: WorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { showToast } = useToast();
  const snackbar = useSnackbar();
  const state = useMemo(() => parseState(new URLSearchParams(params.toString())), [params]);

  // URL is the state. View changes push a history entry (Back undoes them); typing, filters, sort and the preview
  // replace it, so Back leaves the page instead of replaying every keystroke.
  const commit = useCallback((next: Partial<WorkspaceState>, mode: "push" | "replace" = "replace") => {
    const url = pathname + serializeState({ ...state, ...next });
    window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
  }, [pathname, state]);
  const returnTo = pathname + serializeState(state);

  // Optimistic overrides (stage drag, Sales Qualified) until the refreshed server data arrives.
  const [overrides, setOverrides] = useState<Record<string, Partial<Opportunity>>>({});
  useEffect(() => setOverrides({}), [serverRecords]);
  const all = useMemo(() => serverRecords.map((r) => (overrides[r.id] ? { ...r, ...overrides[r.id] } : r)), [serverRecords, overrides]);
  const patch = useCallback((id: string, p: Partial<Opportunity>) => setOverrides((o) => ({ ...o, [id]: { ...o[id], ...p } })), []);

  // Search box: typed locally, written to the URL after a short pause; follows the URL on Back/Forward.
  const [query, setQuery] = useState(state.q);
  useEffect(() => setQuery(state.q), [state.q]);
  useEffect(() => {
    if (query === state.q) return;
    const t = setTimeout(() => commit({ q: query }), 250);
    return () => clearTimeout(t);
  }, [query, state.q, commit]);

  const salesPics = useMemo(() => Array.from(new Set(all.map((r) => r.salesPic).filter(Boolean))).sort(), [all]);
  const toolbarColumns: TableToolbarColumn[] = useMemo(() => [
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
  ], [salesPics]);

  // The one filtered, searched, sorted set every view shows.
  const records = useMemo(() => {
    const searched = all.filter((o) => matchesSearch(o, state.q));
    const filtered = applyFilters(searched, state.filters, fieldValue, { columns: toolbarColumns });
    return state.sorts.length ? applySorts(filtered, state.sorts, sortValue) : filtered;
  }, [all, state.q, state.filters, state.sorts, toolbarColumns]);

  // Columns shown and their order: a per-browser preference, also carried by saved views.
  const [shownKeys, setShownKeysState] = useState<string[]>(DEFAULT_SHOWN);
  useEffect(() => setShownKeysState(readStorage(COLUMNS_KEY, DEFAULT_SHOWN)), []);
  const setShownKeys = useCallback((keys: string[]) => { setShownKeysState(keys); writeStorage(COLUMNS_KEY, keys); }, []);

  // Saved views: built-in operational views plus personal ones kept in this browser.
  const [personalViews, setPersonalViews] = useState<StoredView[]>([]);
  useEffect(() => setPersonalViews(readStorage(VIEWS_KEY, [])), []);
  const savePersonal = (views: StoredView[]) => { setPersonalViews(views); writeStorage(VIEWS_KEY, views); };
  const views = [...BUILT_IN_VIEWS, ...personalViews];
  const active = views.find((v) => v.id === (state.savedView ?? "all")) ?? BUILT_IN_VIEWS[0];
  const current: SavedState = { view: state.view, q: state.q, filters: state.filters, sorts: state.sorts };
  const dirty = JSON.stringify(stripIds(active.state)) !== JSON.stringify(stripIds(current));
  const [naming, setNaming] = useState<null | { mode: "create" | "rename"; id?: string; name: string }>(null);

  function applyView(id: string | null) {
    const v = views.find((x) => x.id === (id ?? "all")) ?? BUILT_IN_VIEWS[0];
    // A built-in view keeps the lens the user is in, except Pipeline aktif, which is a board by nature.
    const view = v.builtIn && v.id !== "active" ? state.view : v.state.view;
    commit({ ...v.state, view, savedView: v.id === "all" ? null : v.id, record: null }, "push");
    if (v.state.shownKeys) setShownKeys(v.state.shownKeys);
  }
  function saveNamed() {
    if (!naming) return;
    const name = naming.name.trim().slice(0, 60) || "Tampilan baru";
    if (naming.mode === "rename" && naming.id) {
      savePersonal(personalViews.map((v) => (v.id === naming.id ? { ...v, name } : v)));
    } else {
      const id = `p${Date.now().toString(36)}`;
      savePersonal([...personalViews, { id, name, state: { ...current, shownKeys } }]);
      commit({ savedView: id });
    }
    setNaming(null);
  }
  const builtInNotice = () => showToast("Tampilan bawaan tidak bisa diubah. Simpan sebagai tampilan baru.", "error");

  // Kanban drag (contract §12): same updateOptyStatus V1's board calls. An ordinary move saves at once with Undo;
  // Win and Dropped ask first (stage-move.tsx), and the card stays where it was until confirmed.
  const [, startMove] = useTransition();
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [convertRequest, setConvertRequest] = useState<string | null>(null);
  const moveTo = useCallback((record: Opportunity, to: string, undoable: boolean) => {
    const from = record.status;
    patch(record.id, { status: to });
    startMove(async () => {
      try {
        await updateOptyStatus(record.id, to);
        router.refresh();
        if (undoable)
          snackbar.show({
            message: `${record.optyNo} dipindah ke ${STAGE_LABEL[to] ?? to}`,
            duration: 7000,
            action: { label: "Batalkan", onClick: () => moveTo({ ...record, status: to }, from, false) },
          });
      } catch (err) {
        patch(record.id, { status: from });
        showToast((err as Error)?.message || "Gagal memindahkan", "error");
      }
    });
  }, [patch, router, snackbar, showToast]);
  function onCardsChange(next: (Opportunity & { columnId: string })[]) {
    const moved = next.find((c) => c.columnId !== (all.find((r) => r.id === c.id)?.status));
    if (!moved || !access.canEdit) return;
    const record = all.find((r) => r.id === moved.id)!;
    if (CONFIRM_STAGES.has(moved.columnId)) setPendingMove({ record, to: moved.columnId });
    else moveTo(record, moved.columnId, true);
  }

  // Coming back (Back, Cancel, Save) with a record in the URL: bring its card into view instead of the board's start.
  useEffect(() => {
    if (!state.record) return;
    document.querySelector(`[data-sales-v2-board] [data-card-id="${CSS.escape(state.record)}"]`)?.scrollIntoView({ block: "nearest", inline: "center" });
    // Once, on arrival.
  }, []);

  const select = useCallback((id: string) => commit({ record: id }), [commit]);
  const closePreview = useCallback(() => commit({ record: null }), [commit]);
  const selected = state.record ? all.find((r) => r.id === state.record) ?? null : null;

  // Table: Excel-style headers (header-filter.tsx) over every Celerates field; widths follow the longest value.
  const widths = useMemo(() => columnWidths(serverRecords), [serverRecords]);
  const valueIndex = useMemo(() => distinctValues(all), [all]);
  const hideColumn = useCallback((key: string) => setShownKeys(shownKeys.filter((k) => k !== key)), [setShownKeys, shownKeys]);
  const columns = useMemo(() => ALL_COLUMNS.map((c): DataTableColumn<Opportunity> => {
    const spec = SPECS[c.key];
    return {
      ...c,
      header: (
        <HeaderFilter
          spec={spec}
          values={valueIndex[c.key] ?? []}
          filters={state.filters}
          sorts={state.sorts}
          onFilters={(filters) => commit({ filters })}
          onSorts={(sorts) => commit({ sorts })}
          onHide={() => hideColumn(c.key)}
        />
      ),
      align: spec.align,
      width: widths[c.key],
      hidden: !shownKeys.includes(c.key),
    };
  }), [valueIndex, state.filters, state.sorts, commit, hideColumn, widths, shownKeys]);
  const [workspaceRef, workspaceHeight] = useHeight<HTMLDivElement>();
  const counts = useMemo(() => Object.fromEntries(KPIS.map((k) => [k.id, all.filter(k.match).length])), [all]);
  const [create, setCreate] = useState<CreateRequest>(null);

  return (
    // Full viewport height: -mb-24 cancels the shell's bottom padding, so the workspace reaches the bottom edge and the
    // Agent launcher floats over it (the scroll areas leave room for it, sales-v2.css).
    <div className="flex flex-col bg-white text-[13px] text-slate-800 md:-mb-24 md:h-dvh" data-sales-v2>
      {/* md:pr-56 keeps the primary action clear of the app's fixed top-right controls (language, bell, account). */}
      <header className="flex items-center justify-between gap-4 px-5 pt-4 pb-3 md:pr-56">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-6 text-slate-900">Opportunity Tracker</h1>
          <p className="text-[13px] text-slate-500">Evaluasi requirement klien sebelum lanjut ke proses hiring.</p>
        </div>
        {access.canEdit ? <CreateMenu options={options} create={create} onCreate={setCreate} /> : <span className="rounded-md bg-slate-100 px-2 py-1 text-[12px] text-slate-600">Mode lihat saja</span>}
      </header>

      {/* The one coloured element on the page (contract §12): each card is a built-in view; click to apply, again to clear. */}
      <section aria-label="Ringkasan" className="mx-5 mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-sales-v2-kpi>
        {KPIS.map((k) => {
          const on = active.id === k.id;
          return (
            <button
              key={k.id}
              type="button"
              aria-pressed={on}
              onClick={() => applyView(on ? null : k.id)}
              data-kpi={k.id}
              className="rounded-lg border text-left transition-shadow hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ background: k.soft, borderColor: on ? k.tone : "transparent", boxShadow: `inset 3px 0 0 ${k.bar}`, outlineColor: k.tone }}
            >
              <StatCard
                className="px-4 py-2"
                label={<span className="text-[12px] font-medium text-slate-600">{k.label}</span>}
                value={<span className="text-[22px] font-bold leading-7 tabular-nums" style={{ color: k.tone }}>{counts[k.id]}</span>}
              />
            </button>
          );
        })}
      </section>

      <div className="flex flex-wrap items-center gap-2 border-y border-slate-100 px-5 py-2" data-sales-v2-toolbar>
        <SavedViews
          label={active.name}
          views={views.map((v) => ({ id: v.id, name: v.name }))}
          activeId={active.id}
          onSelect={applyView}
          onCreate={() => setNaming({ mode: "create", name: "" })}
          onRename={(id) => (personalViews.some((v) => v.id === id) ? setNaming({ mode: "rename", id, name: personalViews.find((v) => v.id === id)!.name }) : builtInNotice())}
          onDuplicate={(id) => { const v = views.find((x) => x.id === id); if (v) savePersonal([...personalViews, { id: `p${Date.now().toString(36)}`, name: `${v.name} (salinan)`, state: v.state }]); }}
          onDelete={(id) => { if (!personalViews.some((v) => v.id === id)) return builtInNotice(); savePersonal(personalViews.filter((v) => v.id !== id)); if (state.savedView === id) applyView(null); }}
          createLabel="Simpan tampilan saat ini"
          renameLabel="Ganti nama"
          duplicateLabel="Duplikat"
          deleteLabel="Hapus"
          searchPlaceholder="Cari tampilan…"
          aria-label="Tampilan tersimpan"
        />
        <ViewToggle<View>
          aria-label="Tampilan data"
          value={state.view}
          onValueChange={(v) => commit({ view: v }, "push")}
          options={[
            { value: "table", label: "Tabel", icon: <Table2 size={14} /> },
            { value: "grid", label: "Grid", icon: <LayoutGrid size={14} /> },
            { value: "kanban", label: "Kanban", icon: <Columns3 size={14} /> },
          ]}
        />
        <div className="w-full sm:w-52">
          <Input
            type="search"
            aria-label="Cari opportunity"
            placeholder="Cari client, Opty No, PIC…"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            suffix={<Search size={14} className="text-slate-400" />}
          />
        </div>
        <TableToolbar
          inline
          columns={toolbarColumns}
          filters={state.filters}
          onFiltersChange={(filters) => commit({ filters })}
          sorts={state.sorts}
          onSortsChange={(sorts) => commit({ sorts })}
          viewColumns={columnsForSettings}
          shownKeys={shownKeys}
          onShownKeysChange={setShownKeys}
          showViewSettings={state.view === "table"}
          count={<span className="text-[12px] text-slate-500" data-sales-v2-count>{records.length} dari {all.length}</span>}
          sortLabel="Urutkan"
          filterLabel="Filter"
          viewSettingsLabel="Kolom"
        />
        {access.canEdit && (
          <Link href="/sales/opportunity-tracker/sheet-sync" title="Google Sheet Sync" className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <RefreshCw size={13} /> Sheet Sync
          </Link>
        )}
      </div>

      {dirty && (
        <SavedViewsSaveBar
          className="px-5"
          onDiscard={() => applyView(active.id)}
          onSave={() => {
            if (active.builtIn) return setNaming({ mode: "create", name: "" });
            savePersonal(personalViews.map((v) => (v.id === active.id ? { ...v, state: { ...current, shownKeys } } : v)));
          }}
          onSaveAsNew={() => setNaming({ mode: "create", name: "" })}
          discardLabel="Batalkan perubahan"
          saveLabel={active.builtIn ? "Simpan sebagai tampilan" : "Simpan tampilan"}
          saveAsNewLabel="Simpan sebagai tampilan baru"
        />
      )}

      <div ref={workspaceRef} className="relative h-[70dvh] min-h-0 md:h-auto md:flex-1" data-sales-v2-workspace={state.view}>
        {state.view === "table" && (
          <DataTable<Opportunity>
            surface="bleed"
            data={records}
            columns={columns}
            columnOrder={[...shownKeys, ...ALL_COLUMN_KEYS.filter((k) => !shownKeys.includes(k))]}
            onColumnOrderChange={(order) => setShownKeys(order.filter((k) => shownKeys.includes(k)))}
            onColumnsChange={(next) => setShownKeys(next.filter((c) => !c.hidden).map((c) => c.key))}
            showViewSettings={false}
            showCount={false}
            interactive
            onRowClick={(row) => select(row.id)}
            height={workspaceHeight}
            locale="id-ID"
            empty={<p className="p-6 text-center text-slate-500">Tidak ada opportunity yang cocok.</p>}
          />
        )}

        {state.view === "grid" && (
          <div className="h-full overflow-y-auto px-5 py-3" data-sales-v2-grid>
            {records.length === 0 && <p className="p-6 text-center text-slate-500">Tidak ada opportunity yang cocok.</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {records.map((o) => (
                <EntityCard
                  key={o.id}
                  aria-label={`${o.client} ${o.optyNo}`}
                  aria-current={o.id === state.record || undefined}
                  onClick={() => select(o.id)}
                  author={<span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500"><StageDot status={o.status} /><span className="font-mono">{o.optyNo}</span> · {STAGE_LABEL[o.status] ?? o.status}</span>}
                  title={o.client}
                  excerpt={[o.position, o.headcount ? `${o.headcount} orang` : null, rupiah(o.price, o.pricePeriod)].filter(Boolean).join(" · ") || "-"}
                  footer={<span className="text-[12px] text-slate-500">{o.salesPic}{o.salesQualified ? " · Qualified" : ""}{o.pq ? " · Sudah convert" : ""}</span>}
                  date={o.lastCommunication ?? undefined}
                />
              ))}
            </div>
          </div>
        )}

        {state.view === "kanban" && (
          <div className="h-full px-3 pt-2" data-sales-v2-board>
            <Board<Opportunity & { columnId: string }>
              columns={STAGES.map((s) => ({ id: s.id, title: s.title, accent: s.accent }))}
              cards={records.map((o) => ({ ...o, columnId: o.status }))}
              onCardsChange={access.canEdit ? onCardsChange : undefined}
              getCardLabel={(c) => `${c.client} ${c.optyNo}`}
              announceMove={(col, card) => `${card ?? "Kartu"} dipindah ke ${col}`}
              onPreviewCard={(c) => select(c.id)}
              previewCardLabel="Lihat ringkasan"
              onNewCard={access.canEdit ? (columnId) => setCreate({ kind: "opportunity", status: columnId }) : undefined}
              newCardLabel="Opportunity baru"
              renderCard={(c) => <KanbanCard o={c} onOpen={() => select(c.id)} />}
            />
          </div>
        )}

        <RecordPreview
          record={selected}
          records={records}
          access={access}
          returnTo={returnTo}
          onSelect={select}
          onClose={closePreview}
          onPatch={patch}
          options={options}
          convertRequest={convertRequest}
          onConvertHandled={() => setConvertRequest(null)}
        />
      </div>

      <StageMoveDialog
        move={pendingMove}
        returnTo={returnTo}
        onCancel={() => setPendingMove(null)}
        onError={(message) => showToast(message, "error")}
        onMoved={(move, convert) => {
          setPendingMove(null);
          patch(move.record.id, { status: move.to });
          router.refresh();
          showToast(`${move.record.optyNo} dipindah ke ${STAGE_LABEL[move.to] ?? move.to}`);
          if (convert) { select(move.record.id); setConvertRequest(move.record.id); }
        }}
      />

      <Dialog open={!!naming} onOpenChange={(o) => !o && setNaming(null)} title={naming?.mode === "rename" ? "Ganti nama tampilan" : "Simpan tampilan"} width={400}>
        {naming && (
          <form onSubmit={(e) => { e.preventDefault(); saveNamed(); }}>
            <DialogBody>
              <FormField label="Nama tampilan">
                <Input autoFocus value={naming.name} maxLength={60} onChange={(e) => setNaming({ ...naming, name: e.currentTarget.value })} />
              </FormField>
              <p className="mt-2 text-[12px] text-slate-500">Disimpan di browser ini: tampilan, pencarian, filter, urutan dan kolom.</p>
            </DialogBody>
            <DialogFooter>
              <Button type="button" size="sm" intent="neutral" onClick={() => setNaming(null)}>Batal</Button>
              <Button type="submit" size="sm" intent="primary">Simpan</Button>
            </DialogFooter>
          </form>
        )}
      </Dialog>
    </div>
  );
}

/** What makes a saved view "changed": the record set and its order. Switching Tabel/Grid/Kanban is only a lens. */
function stripIds(s: SavedState) {
  return { q: s.q.trim(), sorts: s.sorts, filters: s.filters.map(({ key, op, value, values, join }) => ({ key, op, value, values, join })) };
}

// ── Summary cards: built-in views, in the ERP palette ───────────────────────────────────────────────────────
const OPEN = new Set(["cv_submission", "solutioning", "proposal_sent", "need_action"]);
const KPIS: { id: string; label: string; tone: string; soft: string; bar: string; match: (o: Opportunity) => boolean }[] = [
  { id: "all", label: "Total Opportunity", tone: "#194667", soft: "#eef3f7", bar: "#194667", match: () => true },
  { id: "active", label: "Pipeline aktif", tone: "#1a43b8", soft: "#e8eefd", bar: "#2356e8", match: (o) => OPEN.has(o.status) },
  { id: "ready", label: "Siap Convert", tone: "#b2410f", soft: "#fdeee7", bar: "#f15525", match: (o) => o.salesQualified && !o.pq },
  { id: "win", label: "Win", tone: "#0e6b52", soft: "#e1f4ee", bar: "#10b981", match: (o) => o.status === "win" },
  { id: "dropped", label: "Dropped", tone: "#b42318", soft: "#fdecea", bar: "#ef4444", match: (o) => o.status === "dropped" },
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
        <span className="min-w-0 truncate text-[13px] font-semibold leading-5 text-slate-900">{o.client}</span>
        {o.salesQualified && <BadgeCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Sales Qualified" />}
      </span>
      <span className="block truncate font-mono text-[11px] text-slate-500">{o.optyNo}{o.leadNo ? ` · ${o.leadNo}` : ""}</span>
      {(o.position || o.headcount) && (
        <span className="block truncate text-[12px] text-slate-700">{[o.position, o.level ? LEVEL_LABEL[o.level] ?? o.level : null, o.headcount ? `${o.headcount} HC` : null].filter(Boolean).join(" · ")}</span>
      )}
      {o.price != null && <span className="block text-[13px] font-semibold tabular-nums text-slate-900">{rupiah(o.price, o.pricePeriod)}</span>}
      <span className="mt-1 flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5 text-[11px] text-slate-500">
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dce8ef] text-[10px] font-semibold text-[#123650]">{initials(o.salesPic)}</span>
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

const ALL_COLUMNS: Omit<DataTableColumn<Opportunity>, "header">[] = [
  { key: "client", type: "entity", accessor: (o) => o.client },
  { key: "optyNo", render: (_, o) => <span className="font-mono text-[12px] text-slate-600">{o.optyNo}</span> },
  { key: "status", type: "status", accessor: (o) => String(STAGE_ORDER[o.status] ?? 9), format: (_, o) => STAGE_LABEL[o.status] ?? o.status, swatches: STAGE_SWATCH },
  { key: "position" },
  { key: "headcount", type: "number" },
  { key: "price", type: "number", format: (_, o) => rupiah(o.price, o.pricePeriod) },
  { key: "salesPic" },
  { key: "salesQualified", render: (_, o) => (o.salesQualified ? <span className="font-medium text-emerald-700">Qualified</span> : <span className="text-slate-400">Belum</span>) },
  { key: "lastCommunication", accessor: (o) => o.lastCommunication ?? "" },
  { key: "downstream", render: (_, o) => o.requisition ? <span className="font-mono text-[12px]">{o.requisition.no}</span> : o.pq ? <span className="text-[12px]">PQ · Extension</span> : <span className="text-slate-400">-</span> },
  { key: "leadNo", render: (_, o) => <span className="font-mono text-[12px] text-slate-600">{o.leadNo ?? ""}</span> },
  { key: "clientType", accessor: (o) => (o.clientType ? CLIENT_TYPE_LABEL[o.clientType] ?? o.clientType : "") },
  { key: "serviceType", accessor: (o) => (o.serviceType ? SERVICE_LABEL[o.serviceType] ?? o.serviceType : "") },
  { key: "level", accessor: (o) => (o.level ? LEVEL_LABEL[o.level] ?? o.level : "") },
  { key: "durationMonths", type: "number", format: (_, o) => (o.durationMonths ? `${o.durationMonths} bulan` : "") },
  { key: "requirement" },
  { key: "detailRequirement" },
  { key: "closingPrice", type: "number", format: (_, o) => rupiah(o.closingPrice) },
  { key: "bante", type: "number" },
  { key: "progressNotes" },
  { key: "droppedReason" },
];
const ALL_COLUMN_KEYS = ALL_COLUMNS.map((c) => c.key);
const columnsForSettings: TableToolbarColumn[] = ALL_COLUMNS.map((c) => ({ key: c.key, label: SPECS[c.key].label }));

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

/** Width per column from its longest value or header (≈7px a character at 13px), between 80 and 320px. */
function columnWidths(rows: Opportunity[]): Record<string, number> {
  return Object.fromEntries(ALL_COLUMN_KEYS.map((key) => {
    let w = SPECS[key].label.length * 7 + 64; // icon, gaps, sort and filter marks
    for (const o of rows) w = Math.max(w, cellText(o, key).length * 7 + (key === "client" ? 56 : 28));
    return [key, Math.min(320, Math.max(80, Math.ceil(w)))];
  }));
}

/** Distinct values (with counts) for each checklist column, in the order a person scans them. */
function distinctValues(rows: Opportunity[]): Record<string, [string, number][]> {
  const out: Record<string, [string, number][]> = {};
  for (const [key, spec] of Object.entries(SPECS)) {
    if (spec.kind !== "values") continue;
    const counts = new Map<string, number>();
    for (const o of rows) { const v = String(fieldValue(o, key) ?? ""); counts.set(v, (counts.get(v) ?? 0) + 1); }
    out[key] = key === "status"
      ? STAGES.map((s) => [s.title, counts.get(s.title) ?? 0])
      : [...counts].sort((a, b) => a[0].localeCompare(b[0], "id", { numeric: true }));
  }
  return out;
}
