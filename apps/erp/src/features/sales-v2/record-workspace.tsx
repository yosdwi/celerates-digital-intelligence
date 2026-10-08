"use client";
// Sales V2 record workspace, shared by every V2 page (Opportunity Tracker, PQ Tracker, …): one record set, one state
// (in the URL), three views (Tabel · Grid · Kanban), clickable summary cards, saved views, Excel-style headers and a
// slot for the page's own record panel. A page supplies a WorkspaceConfig plus its panel, dialogs and toolbar actions.
// docs/design/SALES-V2-CRISP-UX-CONTRACT.md is the contract this file implements.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3, History, LayoutGrid, Search, Sparkles, Table2 } from "lucide-react";
import {
  DataTable, EntityCard, Input, SavedViews, SavedViewsSaveBar, StatCard, TableToolbar, ViewToggle, useSnackbar,
  applyFilters, applySorts, Button, Dialog, DialogBody, DialogFooter, FormField,
  type ContextMenuOption, type DataTableColumn, type TableToolbarColumn,
} from "@crisp-ui-kit/crisp";
import { useToast } from "@/components/toast-provider";
import { GRADIENTS, type StatColor } from "@/components/stat-card";
import { openAgent } from "@/components/mobile/events";
import { setRightRail, useRightRail } from "@/lib/right-rail";
import { HeaderFilter, type HeaderSpec } from "./header-filter";
import { KanbanBoard } from "./board-menu";
import { HistoryList, ModuleHistoryDrawer } from "./history";
import type { HistoryRecordType } from "@/lib/field-history";
import { parseState, serializeState, type SavedState, type StoredView, type View, type WorkspaceState } from "./model";

export type Access = { canEdit: boolean; canDelete: boolean };
/** A summary card: V1's gradient colours (components/stat-card.tsx). */
export type Kpi<T> = { id: string; label: string; color: StatColor; match: (o: T) => boolean };
export type PendingMove<T> = { record: T; to: string };

/** A row's Aksi cell asking the panel to open one of its dialogs ("edit", "delete", "convert", …) for a record. */
export type PanelRequest = { id: string; action: string };

/** What the page's record panel gets: the selection, the visible list (Previous / Next) and the optimistic patch. */
export type PanelContext<T> = {
  record: T | null;
  records: T[];
  returnTo: string;
  select: (id: string) => void;
  close: () => void;
  patch: (id: string, p: Partial<T>) => void;
  /** A dialog the Aksi column asked for; the panel opens it once its record is selected, then calls `clearRequest`. */
  request: PanelRequest | null;
  clearRequest: () => void;
};

/**
 * What a table cell (the V1 Aksi / Status column) may do: open the record with one of the panel's dialogs, or save a
 * quick change optimistically (`run`: patch, call the V1 action, refresh; put it back and say so if it fails).
 */
export type RowActions = {
  access: Access;
  open: (id: string, action?: string) => void;
  run: (record: { id: string }, patch: Record<string, unknown>, action: () => Promise<unknown>) => void;
  /** Save one field the way its table cell does (`WorkspaceConfig.edits`); rejects with the reason it failed. */
  edit: (id: string, key: string, value: string) => Promise<void>;
  /** Edit history: the record type, and a stored field's label and value as the page shows them. */
  history: { recordType: HistoryRecordType; label: (field: string) => string; format: (field: string, value: string | null) => string };
  /** Open the page's Riwayat drawer, on one record's changes when given. */
  showHistory: (recordId?: string) => void;
};
const RowActionsContext = createContext<RowActions | null>(null);
export function useRowActions(): RowActions {
  const ctx = useContext(RowActionsContext);
  if (!ctx) throw new Error("useRowActions outside RecordWorkspace");
  return ctx;
}
/** A Kanban move into a confirm stage, waiting for the page's dialog. `onMoved` after the server saved it. */
export type MoveContext<T> = { move: PendingMove<T> | null; returnTo: string; onCancel: () => void; onMoved: () => void; select: (id: string) => void };

export type WorkspaceConfig<T extends { id: string }> = {
  title: string;
  subtitle: string;
  /** "opportunity", "PQ": used in the search label and the empty state. */
  noun: string;
  searchPlaceholder: string;
  /** localStorage keys: shown columns, personal saved views. */
  storage: { columns: string; views: string };
  /** Fields a URL filter or sort may name. */
  fieldKeys: Set<string>;
  fieldValue: (o: T, key: string) => unknown;
  sortValue: (o: T, key: string) => unknown;
  matchesSearch: (o: T, q: string) => boolean;
  toolbarColumns: (all: T[]) => TableToolbarColumn[];
  builtInViews: StoredView[];
  /** Built-in views that are boards by nature; the others keep the lens the user is in. */
  boardViews?: string[];
  kpis: Kpi<T>[];
  specs: Record<string, HeaderSpec>;
  columns: Omit<DataTableColumn<T>, "header">[];
  /** What a cell shows, as text: drives the auto column width. */
  cellText: (o: T, key: string) => string;
  /** Checklist order for coded columns (a pipeline in its own order, zero counts kept). */
  valueOrder?: Record<string, readonly string[]>;
  defaultShown: string[];
  /**
   * V1's frozen columns, in order (QA 2026-10-08): shown together as the table's first column, which Crisp pins while
   * the rest scrolls (it pins one column; its column virtualization would drop a separately pinned second one). Always
   * shown and first; each keeps its own header menu. One line each, sized to its values: a longer value ends in "…"
   * and shows whole on hover and in the panel.
   */
  frozen?: string[];
  /**
   * Fields edited where they are shown (QA 2026-10-08, Attio-style): in their table cell (double-click or Enter; Crisp's
   * cell menu Paste / Clear value too) and in the panel. `patch` is the optimistic change, `save` posts it with the V1
   * action; a `required` field refuses an empty value. `field` is the stored column, for its edit history.
   */
  edits?: Record<string, { field: string; required?: boolean; patch: (o: T, value: string) => Partial<T>; save: (o: T, value: string) => Promise<unknown> }>;
  /** The record type its edit history is stored under (lib/field-history.ts). */
  recordType: HistoryRecordType;
  /** Right-click menu on a table row (QA 2026-10-08): the record's quick actions, only those its user may take. */
  rowMenu?: (o: T, row: RowActions) => ContextMenuOption[];
  grid: (o: T) => { label: string; author: React.ReactNode; title: string; excerpt: string; footer: React.ReactNode; date?: string };
  board: {
    stages: readonly { id: string; title: string; accent: string }[];
    stageOf: (o: T) => string;
    /** The optimistic change a move to `to` makes (stage, and anything the server sets with it). */
    withStage: (o: T, to: string) => Partial<T>;
    /** Save a move with the existing V1 action(s); throws on failure. */
    move: (o: T, to: string) => Promise<void>;
    /** Undo of an ordinary move: put `original` back. Defaults to moving it to its old stage. */
    restore?: (original: T) => Promise<void>;
    /** Stages a card only enters after the page's confirm dialog (they close the record). */
    confirm: ReadonlySet<string>;
    /** Short id for messages ("OPTY-…"). */
    recordLabel: (o: T) => string;
    cardLabel: (o: T) => string;
    renderCard: (o: T, open: () => void) => React.ReactNode;
  };
};

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

/** Crisp's Snackbar (Undo after a Kanban move) needs a SnackbarProvider above this component. */
export function RecordWorkspace<T extends { id: string }>({
  config: c, records: serverRecords, access, headerEnd, toolbarEnd, renderPanel, renderMoveDialog,
}: {
  config: WorkspaceConfig<T>;
  records: T[];
  access: Access;
  /** Page-level links beside the title (e.g. "Versi lama"). */
  headerEnd?: React.ReactNode;
  /** Dataset actions at the end of the toolbar, primary last (Attio: Import / Export · + New). */
  toolbarEnd?: React.ReactNode;
  renderPanel: (ctx: PanelContext<T>) => React.ReactNode;
  renderMoveDialog: (ctx: MoveContext<T>) => React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { showToast } = useToast();
  const snackbar = useSnackbar();
  const state = useMemo(() => parseState(new URLSearchParams(params.toString()), c.fieldKeys), [params, c.fieldKeys]);

  // URL is the state. View changes push a history entry (Back undoes them); typing, filters, sort and the preview
  // replace it, so Back leaves the page instead of replaying every keystroke.
  const commit = useCallback((next: Partial<WorkspaceState>, mode: "push" | "replace" = "replace") => {
    const url = pathname + serializeState({ ...state, ...next });
    window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
  }, [pathname, state]);
  const returnTo = pathname + serializeState(state);

  // Optimistic overrides (stage drag, quick edits in the panel) until the refreshed server data arrives.
  const [overrides, setOverrides] = useState<Record<string, Partial<T>>>({});
  useEffect(() => setOverrides({}), [serverRecords]);
  const all = useMemo(() => serverRecords.map((r) => (overrides[r.id] ? { ...r, ...overrides[r.id] } : r)), [serverRecords, overrides]);
  const patch = useCallback((id: string, p: Partial<T>) => setOverrides((o) => ({ ...o, [id]: { ...o[id], ...p } })), []);

  // Search box: typed locally, written to the URL after a short pause; follows the URL on Back/Forward.
  const [query, setQuery] = useState(state.q);
  useEffect(() => setQuery(state.q), [state.q]);
  useEffect(() => {
    if (query === state.q) return;
    const t = setTimeout(() => commit({ q: query }), 250);
    return () => clearTimeout(t);
  }, [query, state.q, commit]);

  const toolbarColumns = useMemo(() => c.toolbarColumns(all), [c, all]);

  // The one filtered, searched, sorted set every view shows.
  const records = useMemo(() => {
    const searched = all.filter((o) => c.matchesSearch(o, state.q));
    const filtered = applyFilters(searched, state.filters, c.fieldValue, { columns: toolbarColumns });
    return state.sorts.length ? applySorts(filtered, state.sorts, c.sortValue) : filtered;
  }, [c, all, state.q, state.filters, state.sorts, toolbarColumns]);

  // Columns shown and their order: a per-browser preference, also carried by saved views.
  const [shownKeys, setShownKeysState] = useState<string[]>(c.defaultShown);
  useEffect(() => setShownKeysState(readStorage(c.storage.columns, c.defaultShown)), [c]);
  const setShownKeys = useCallback((keys: string[]) => { setShownKeysState(keys); writeStorage(c.storage.columns, keys); }, [c]);

  // Saved views: built-in operational views plus personal ones kept in this browser.
  const [personalViews, setPersonalViews] = useState<StoredView[]>([]);
  useEffect(() => setPersonalViews(readStorage(c.storage.views, [])), [c]);
  const savePersonal = (views: StoredView[]) => { setPersonalViews(views); writeStorage(c.storage.views, views); };
  const views = [...c.builtInViews, ...personalViews];
  const active = views.find((v) => v.id === (state.savedView ?? "all")) ?? c.builtInViews[0];
  const current: SavedState = { view: state.view, q: state.q, filters: state.filters, sorts: state.sorts };
  const dirty = JSON.stringify(stripIds(active.state)) !== JSON.stringify(stripIds(current));
  const [naming, setNaming] = useState<null | { mode: "create" | "rename"; id?: string; name: string }>(null);

  function applyView(id: string | null) {
    const v = views.find((x) => x.id === (id ?? "all")) ?? c.builtInViews[0];
    const view = v.builtIn && !c.boardViews?.includes(v.id) ? state.view : v.state.view;
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

  // Kanban drag (contract §12): an ordinary move saves at once with Undo; confirm stages ask first (the page's
  // dialog), and the card stays where it was until confirmed.
  const { board } = c;
  const [, startMove] = useTransition();
  const [pendingMove, setPendingMove] = useState<PendingMove<T> | null>(null);
  const moveTo = useCallback((record: T, to: string) => {
    patch(record.id, board.withStage(record, to));
    startMove(async () => {
      try {
        await board.move(record, to);
        router.refresh();
        snackbar.show({
          message: `${board.recordLabel(record)} dipindah ke ${stageTitle(board.stages, to)}`,
          duration: 7000,
          action: {
            label: "Batalkan",
            onClick: () => {
              patch(record.id, record);
              startMove(async () => {
                try { await (board.restore ? board.restore(record) : board.move(record, board.stageOf(record))); router.refresh(); }
                catch (err) { showToast((err as Error)?.message || "Gagal membatalkan", "error"); router.refresh(); }
              });
            },
          },
        });
      } catch (err) {
        patch(record.id, record);
        showToast((err as Error)?.message || "Gagal memindahkan", "error");
      }
    });
  }, [board, patch, router, snackbar, showToast]);
  function onCardsChange(next: (T & { columnId: string })[]) {
    const moved = next.find((x) => { const r = all.find((o) => o.id === x.id); return r && x.columnId !== board.stageOf(r); });
    if (!moved || !access.canEdit) return;
    const record = all.find((r) => r.id === moved.id)!;
    if (board.confirm.has(moved.columnId)) setPendingMove({ record, to: moved.columnId });
    else moveTo(record, moved.columnId);
  }

  // Coming back (Back, Cancel, Save) with a record in the URL: bring its card into view instead of the board's start.
  useEffect(() => {
    if (!state.record) return;
    document.querySelector(`[data-sales-v2-board] [data-card-id="${CSS.escape(state.record)}"]`)?.scrollIntoView({ block: "nearest", inline: "center" });
    // Once, on arrival.
  }, []);

  const select = useCallback((id: string) => commit({ record: id }), [commit]);
  const [request, setRequest] = useState<PanelRequest | null>(null);
  const [, startRow] = useTransition();
  const allRef = useRef(all);
  allRef.current = all;
  const edit = useCallback(async (id: string, key: string, value: string) => {
    const o = allRef.current.find((r) => r.id === id);
    const e = c.edits?.[key];
    if (!o || !e) return;
    if (e.required && !value.trim()) throw new Error(`${c.specs[key]?.label ?? key} wajib diisi`);
    const p = e.patch(o, value);
    const before = Object.fromEntries(Object.keys(p).map((k) => [k, (o as Record<string, unknown>)[k]])) as Partial<T>;
    patch(id, p);
    try {
      await e.save(o, value);
      router.refresh();
    } catch (err) {
      patch(id, before);
      throw err instanceof Error ? err : new Error("Gagal menyimpan");
    }
  }, [c, patch, router]);
  // Labels and option labels for stored fields, so the edit history reads as the table does.
  const history = useMemo<RowActions["history"]>(() => {
    const meta = new Map<string, { label: string; options?: Map<string, string> }>();
    for (const [key, e] of Object.entries(c.edits ?? {})) {
      const col = c.columns.find((x) => x.key === key);
      meta.set(e.field, { label: c.specs[key]?.label ?? key, options: col?.options ? new Map(col.options.map((o) => [o.value, String(o.label)])) : undefined });
    }
    return {
      recordType: c.recordType,
      label: (f) => meta.get(f)?.label ?? humanize(f),
      format: (f, v) => (v == null ? "" : meta.get(f)?.options?.get(v) ?? (v === "true" ? "Ya" : v === "false" ? "Tidak" : /^\d{4,}$/.test(v) ? Number(v).toLocaleString("id-ID") : v)),
    };
  }, [c]);
  const [historyOf, setHistoryOf] = useState<null | { id: string; key: string }>(null);
  const [feedOf, setFeedOf] = useState<null | { recordId: string | null }>(null);
  const rowActions = useMemo<RowActions>(() => ({
    edit,
    history,
    access,
    showHistory: (recordId) => setFeedOf({ recordId: recordId ?? null }),
    open: (id, action) => { commit({ record: id }); setRequest(action ? { id, action } : null); },
    run: (record, p, action) => {
      const before = Object.fromEntries(Object.keys(p).map((k) => [k, (record as Record<string, unknown>)[k]]));
      patch(record.id, p as Partial<T>);
      startRow(async () => {
        try { await action(); router.refresh(); }
        catch (err) { patch(record.id, before as Partial<T>); showToast((err as Error)?.message || "Gagal menyimpan", "error"); }
      });
    },
  }), [access, commit, patch, router, showToast, edit, history]);
  const closePreview = useCallback(() => commit({ record: null }), [commit]);
  const selected = state.record ? all.find((r) => r.id === state.record) ?? null : null;

  // Table: Excel-style headers (header-filter.tsx) over every field; widths follow the longest value.
  const frozenKeys = useMemo(() => c.frozen ?? [], [c]);
  const allKeys = useMemo(() => c.columns.map((x) => x.key).filter((k) => !frozenKeys.includes(k)), [c, frozenKeys]);
  const widths = useMemo(() => columnWidths(c, serverRecords), [c, serverRecords]);
  const valueIndex = useMemo(() => distinctValues(c, all), [c, all]);
  const hideColumn = useCallback((key: string) => setShownKeys(shownKeys.filter((k) => k !== key)), [setShownKeys, shownKeys]);
  const columns = useMemo(() => {
    const header = (key: string, onHide?: () => void) => (
      <HeaderFilter
        spec={c.specs[key]}
        values={valueIndex[key] ?? []}
        filters={state.filters}
        sorts={state.sorts}
        onFilters={(filters) => commit({ filters })}
        onSorts={(sorts) => commit({ sorts })}
        onHide={onHide}
      />
    );
    const regular = c.columns.filter((col) => !frozenKeys.includes(col.key)).map((col): DataTableColumn<T> => ({
      ...col,
      header: header(col.key, () => hideColumn(col.key)),
      align: c.specs[col.key].align,
      editable: access.canEdit && !!c.edits?.[col.key],
      width: col.width ?? widths[col.key],
      hidden: !shownKeys.includes(col.key),
    }));
    if (!frozenKeys.length) return regular;
    // V1's frozen block as one pinned column: each part keeps its width and header menu, cells stack like V1's.
    const parts = frozenKeys.map((key) => {
      const col = c.columns.find((x) => x.key === key)!;
      return { col, width: (col.width as number | undefined) ?? widths[key] };
    });
    const frozen: DataTableColumn<T> = {
      key: FROZEN,
      width: parts.reduce((n, p) => n + p.width, 0),
      header: (
        <span className="flex w-full items-stretch" data-sales-v2-frozen-head>
          {parts.map(({ col, width }) => <span key={col.key} className="flex shrink-0 items-center pr-3" style={{ width }}>{header(col.key)}</span>)}
        </span>
      ),
      render: (_, row) => (
        <span className="flex w-full items-center" data-sales-v2-frozen>
          {parts.map(({ col, width }) => (
            <span key={col.key} className="min-w-0 shrink-0 truncate pr-3" style={{ width }} title={c.cellText(row, col.key) || undefined}>
              {col.render ? col.render(undefined as never, row) : c.cellText(row, col.key)}
            </span>
          ))}
        </span>
      ),
    };
    return [frozen, ...regular];
  }, [c, frozenKeys, valueIndex, state.filters, state.sorts, commit, hideColumn, widths, shownKeys, access.canEdit]);
  const columnsForSettings: TableToolbarColumn[] = useMemo(() => c.columns.filter((x) => !frozenKeys.includes(x.key)).map((x) => ({ key: x.key, label: c.specs[x.key].label })), [c, frozenKeys]);
  const [workspaceRef, workspaceHeight] = useHeight<HTMLDivElement>();
  const counts = useMemo(() => Object.fromEntries(c.kpis.map((k) => [k.id, all.filter(k.match).length])), [c, all]);
  const valuesOf = useCallback((rows: T[]) => distinctValues(c, rows), [c]);
  const empty = <p className="p-6 text-center text-slate-500">Tidak ada {c.noun} yang cocok.</p>;

  return (
    // Full viewport height: -mb-24 cancels the shell's bottom padding, so the workspace reaches the bottom edge and the
    // Agent launcher floats over it (the scroll areas leave room for it, sales-v2.css).
    <RowActionsContext.Provider value={rowActions}>
    <div className="flex flex-col bg-white text-[0.8125rem] text-slate-800 md:-mb-24 md:h-dvh" data-sales-v2>
      {/* md:pr-56 keeps the header clear of the app's fixed top-right controls (language, bell, account). */}
      {/* Density (contract §5, §15): fixed compact sizes like Attio, never zoom; a 1280 × 650 laptop viewport (1366 or
          1920 screens at 125–150 % OS scaling) must show the table without the chrome eating the height. */}
      <header className="flex items-center justify-between gap-4 px-5 pt-3 pb-2 md:pr-56">
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-6 text-slate-900">{c.title}</h1>
          <p className="truncate text-[0.75rem] leading-4 text-slate-500" data-sales-v2-subtitle>{c.subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerEnd}
          {!access.canEdit && <span className="rounded-md bg-slate-100 px-2 py-1 text-[0.75rem] text-slate-600">Mode lihat saja</span>}
        </div>
      </header>

      {/* Summary cards in V1's gradients (QA 2026-10-08); each card is a built-in view: click to apply, again to clear. */}
      <section aria-label="Ringkasan" className={`mx-5 mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 ${c.kpis.length > 5 ? "lg:grid-cols-6" : "lg:grid-cols-5"}`} data-sales-v2-kpi>
        {c.kpis.map((k) => {
          const on = active.id === k.id;
          const g = GRADIENTS[k.color];
          return (
            <button
              key={k.id}
              type="button"
              aria-pressed={on}
              onClick={() => applyView(on ? null : k.id)}
              data-kpi={k.id}
              className="relative overflow-hidden rounded-xl text-left text-white transition-all duration-200 hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              style={{ backgroundImage: g.bg, boxShadow: on ? `0 0 0 2px #fff, 0 0 0 4px ${g.glow.replace(/[\d.]+\)$/, "0.9)")}` : `0 1px 2px rgba(15,23,42,0.08), 0 10px 20px -12px ${g.glow}` }}
            >
              <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-white/15" />
              <StatCard
                className="relative px-3 py-1.5"
                label={<span className="text-[0.75rem] font-medium text-white/85">{k.label}</span>}
                value={<span className="text-[1.125rem] font-extrabold leading-6 tabular-nums text-white">{counts[k.id]}</span>}
              />
            </button>
          );
        })}
      </section>

      <div className="flex flex-wrap items-center gap-2 border-y border-slate-100 px-5 py-1.5" data-sales-v2-toolbar>
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
        <div className="w-full sm:w-44">
          <Input
            type="search"
            aria-label={`Cari ${c.noun}`}
            placeholder={c.searchPlaceholder}
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
          count={<span className="text-[0.75rem] text-slate-500" data-sales-v2-count>{records.length} dari {all.length}</span>}
          sortLabel="Urutkan"
          filterLabel="Filter"
          viewSettingsLabel="Kolom"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" intent="ghost" onClick={() => setFeedOf({ recordId: null })} data-sales-v2-history-open><History size={14} /> Riwayat</Button>
          {toolbarEnd}
        </div>
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
          <DataTable<T>
            surface="bleed"
            data={records}
            columns={columns}
            columnOrder={[...(frozenKeys.length ? [FROZEN] : []), ...shownKeys.filter((k) => allKeys.includes(k)), ...allKeys.filter((k) => !shownKeys.includes(k))]}
            onColumnOrderChange={(order) => setShownKeys(order.filter((k) => k !== FROZEN && shownKeys.includes(k)))}
            onColumnsChange={(next) => setShownKeys(next.filter((x) => !x.hidden && x.key !== FROZEN).map((x) => x.key))}
            showViewSettings={false}
            showCount={false}
            stickyFirst
            // A click selects a cell (double-click edits it, Attio-style); the record opens from its name link, the
            // row menu's Buka, or a card (QA 2026-10-08).
            interactive
            onEdit={edit}
            onViewEditHistory={(id, key) => setHistoryOf({ id, key })}
            rowContextMenu={c.rowMenu ? (row) => c.rowMenu!(row, rowActions) : undefined}
            // A bounded scroll box without Crisp's row virtualization: that assumes 36px rows, and V1's Aksi column
            // stacks taller ones (the frozen block, QA 2026-10-08); a few hundred rows render fine.
            scrollProps={{ style: { overflowY: "auto", height: workspaceHeight, maxHeight: workspaceHeight } }}
            locale="id-ID"
            empty={empty}
          />
        )}

        {state.view === "grid" && (
          <div className="h-full overflow-y-auto px-5 py-3" data-sales-v2-grid>
            {records.length === 0 && empty}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {records.map((o) => {
                const g = c.grid(o);
                return (
                  <EntityCard
                    key={o.id}
                    aria-label={g.label}
                    aria-current={o.id === state.record || undefined}
                    onClick={() => select(o.id)}
                    author={g.author}
                    title={g.title}
                    excerpt={g.excerpt}
                    footer={g.footer}
                    date={g.date}
                  />
                );
              })}
            </div>
          </div>
        )}

        {state.view === "kanban" && (
          <KanbanBoard<T>
            config={c}
            records={records}
            toolbarColumns={toolbarColumns}
            valuesOf={valuesOf}
            onCardsChange={access.canEdit ? onCardsChange : undefined}
            onOpen={select}
          />
        )}

        {renderPanel({ record: selected, records, returnTo, select, close: closePreview, patch, request, clearRequest: () => setRequest(null) })}
      </div>

      {renderMoveDialog({
        move: pendingMove,
        returnTo,
        select,
        onCancel: () => setPendingMove(null),
        onMoved: () => {
          if (!pendingMove) return;
          const { record, to } = pendingMove;
          setPendingMove(null);
          patch(record.id, board.withStage(record, to));
          router.refresh();
          showToast(`${board.recordLabel(record)} dipindah ke ${stageTitle(board.stages, to)}`);
        },
      })}

      {/* "View edit history" from a cell's menu: that field's history (the whole record's for a computed column). */}
      <Dialog open={!!historyOf} onOpenChange={(o) => !o && setHistoryOf(null)} title={historyOf ? `Riwayat ${c.specs[historyOf.key]?.label ?? ""}` : ""} closeLabel="Tutup" width={480} data-sales-v2-dialog="history">
        {historyOf && (
          <DialogBody>
            <HistoryList recordId={historyOf.id} field={c.edits?.[historyOf.key]?.field} />
          </DialogBody>
        )}
      </Dialog>

      <ModuleHistoryDrawer
        open={!!feedOf}
        recordId={feedOf?.recordId}
        onClose={() => setFeedOf(null)}
        onClearRecord={() => setFeedOf({ recordId: null })}
        labelOf={(id) => { const o = all.find((r) => r.id === id); return o ? c.board.cardLabel(o) : null; }}
        onOpenRecord={(id) => { setFeedOf(null); select(id); }}
      />

      <Dialog open={!!naming} onOpenChange={(o) => !o && setNaming(null)} title={naming?.mode === "rename" ? "Ganti nama tampilan" : "Simpan tampilan"} width={400}>
        {naming && (
          <form onSubmit={(e) => { e.preventDefault(); saveNamed(); }}>
            <DialogBody>
              <FormField label="Nama tampilan">
                <Input autoFocus value={naming.name} maxLength={60} onChange={(e) => setNaming({ ...naming, name: e.currentTarget.value })} />
              </FormField>
              <p className="mt-2 text-[0.75rem] text-slate-500">Disimpan di browser ini: tampilan, pencarian, filter, urutan dan kolom.</p>
            </DialogBody>
            <DialogFooter>
              <Button type="button" size="sm" intent="neutral" onClick={() => setNaming(null)}>Batal</Button>
              <Button type="submit" size="sm" intent="primary">Simpan</Button>
            </DialogFooter>
          </form>
        )}
      </Dialog>
    </div>
    </RowActionsContext.Provider>
  );
}

const FROZEN = "__frozen";
/** A stored column name as words, for fields no table column shows ("pks_status_code" → "Pks status"). */
const humanize = (f: string) => { const w = f.replace(/_(code|name)$/, "").replace(/_/g, " "); return w.charAt(0).toUpperCase() + w.slice(1); };
const stageTitle = (stages: readonly { id: string; title: string }[], id: string) => stages.find((s) => s.id === id)?.title ?? id;

/** What makes a saved view "changed": the record set and its order. Switching Tabel/Grid/Kanban is only a lens. */
function stripIds(s: SavedState) {
  return { q: s.q.trim(), sorts: s.sorts, filters: s.filters.map(({ key, op, value, values, join }) => ({ key, op, value, values, join })) };
}

/** Width per column from its longest value or header (≈7px a character at 13px), between 80 and 320px. */
function columnWidths<T extends { id: string }>(c: WorkspaceConfig<T>, rows: T[]): Record<string, number> {
  return Object.fromEntries(c.columns.map(({ key }) => {
    let w = c.specs[key].label.length * 7 + 64; // icon, gaps, sort and filter marks
    for (const o of rows) w = Math.max(w, c.cellText(o, key).length * 7 + (key === c.columns[0].key ? 56 : 28));
    return [key, Math.min(320, Math.max(80, Math.ceil(w)))];
  }));
}

/** Distinct values (with counts) for each checklist column, in the order a person scans them. */
function distinctValues<T extends { id: string }>(c: WorkspaceConfig<T>, rows: T[]): Record<string, [string, number][]> {
  const out: Record<string, [string, number][]> = {};
  for (const [key, spec] of Object.entries(c.specs)) {
    if (spec.kind !== "values") continue;
    const counts = new Map<string, number>();
    for (const o of rows) { const v = String(c.fieldValue(o, key) ?? ""); counts.set(v, (counts.get(v) ?? 0) + 1); }
    const order = c.valueOrder?.[key];
    out[key] = order
      ? [...order.map((v): [string, number] => [v, counts.get(v) ?? 0]), ...[...counts].filter(([v]) => !order.includes(v))]
      : [...counts].sort((a, b) => a[0].localeCompare(b[0], "id", { numeric: true }));
  }
  return out;
}

// ── Record panel and the right rail (contract §9) ───────────────────────────────────────────────────────────
/**
 * Wiring every V2 record panel shares. Publishes how much of the right edge the panel covers (the Agent launcher
 * steps aside), names the record for the Agent's context, and closes on Escape unless a dialog or the Agent takes it.
 * Render the returned ref on a hidden element next to the panel.
 */
export function useRecordPanelRail(rail: { type: string; id: string; label: string } | null, onClose: () => void, dialogOpen: boolean) {
  const state = useRightRail();
  const wrapRef = useRef<HTMLDivElement>(null);
  const visible = !!rail;

  useEffect(() => {
    const panel = wrapRef.current?.parentElement?.querySelector<HTMLElement>(".crisp-recordpanel");
    if (!visible || !panel) {
      setRightRail({ panelWidth: 0 });
      return;
    }
    // Layout position (offsetLeft), not getBoundingClientRect: the panel slides in with a transform, so its rect still
    // sits off-screen when this runs.
    const publish = () => {
      const container = panel.offsetParent as HTMLElement | null;
      const left = (container?.getBoundingClientRect().left ?? 0) + panel.offsetLeft;
      setRightRail({ panelWidth: Math.max(0, Math.round(window.innerWidth - left)) });
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(panel);
    window.addEventListener("resize", publish);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", publish);
      setRightRail({ panelWidth: 0 });
    };
  }, [visible, rail?.id]);

  useEffect(() => { setRightRail({ record: rail }); }, [rail?.type, rail?.id, rail?.label]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setRightRail({ record: null }), []);

  useEffect(() => {
    if (!visible || state.agentOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !dialogOpen && !document.querySelector("[data-crisp-dialog]")) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, state.agentOpen, dialogOpen, onClose]);

  return wrapRef;
}

/** Panel title with "Tanya Agent": the panel owns the right edge while open, so the Agent is reached from here. */
export function PanelTitle({ name, prefill }: { name: string; prefill: string }) {
  return (
    <span className="flex min-w-0 items-center justify-between gap-2">
      <span className="truncate">{name}</span>
      <button
        type="button"
        onClick={() => openAgent({ prefill })}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[0.75rem] font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700"
        data-sales-v2-ask-agent
      >
        <Sparkles size={13} /> Tanya Agent
      </button>
    </span>
  );
}
