"use client";
// Kanban with a menu on each column header (QA 2026-10-08): the same sort and filter a table header offers, scoped to
// that column's cards, plus Hide. Crisp's Board takes a column title as text only, so the header is wired here: a click
// (or Enter) on it opens a Crisp Popover over it. Column sort, filters and hidden columns last for this visit only;
// the toolbar's own search, filters and sort still apply to the whole board first.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, EyeOff } from "lucide-react";
import { Board, Button, Popover, Select, applyFilters, applySorts, type TableToolbarColumn, type ToolbarFilter, type ToolbarSort } from "@crisp-ui-kit/crisp";
import { BoolChoice, ContainsField, MenuButton, RangeFields, ValueList } from "./header-filter";
import type { WorkspaceConfig } from "./record-workspace";

type Column = { sort?: ToolbarSort; filters: ToolbarFilter[]; field?: string };
type Card<T> = T & { columnId: string };

export function KanbanBoard<T extends { id: string }>({
  config: c, records, toolbarColumns, valuesOf, onCardsChange, onOpen,
}: {
  config: WorkspaceConfig<T>;
  records: T[];
  toolbarColumns: TableToolbarColumn[];
  /** Distinct values with counts per field, for a column's value checklists. */
  valuesOf: (rows: T[]) => Record<string, [string, number][]>;
  onCardsChange?: (next: Card<T>[]) => void;
  onOpen: (id: string) => void;
}) {
  const { board } = c;
  const [cols, setCols] = useState<Record<string, Column>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  const [menu, setMenu] = useState<null | { stage: string; left: number; top: number; width: number; height: number }>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const shown = board.stages.filter((s) => !hidden.includes(s.id));
  const byStage = useMemo(() => {
    const m = new Map<string, T[]>(board.stages.map((s) => [s.id, []]));
    for (const r of records) m.get(board.stageOf(r))?.push(r);
    return m;
  }, [board, records]);
  const rowsOf = (stage: string) => {
    const st = cols[stage];
    let rows = byStage.get(stage) ?? [];
    if (st?.filters.length) rows = applyFilters(rows, st.filters, c.fieldValue, { columns: toolbarColumns });
    if (st?.sort) rows = applySorts(rows, [st.sort], c.sortValue);
    return rows;
  };
  const cards = shown.flatMap((s) => rowsOf(s.id).map((o) => ({ ...o, columnId: s.id })));
  const stageVars = Object.fromEntries(shown.map((s, i) => [`--stage-${i + 1}`, s.accent])) as React.CSSProperties;

  // Headers act as buttons: focusable, named, Enter / Space open the menu like a click.
  useEffect(() => {
    wrapRef.current?.querySelectorAll<HTMLElement>(".crisp-board-col-header").forEach((h, i) => {
      h.tabIndex = 0;
      h.setAttribute("role", "button");
      h.setAttribute("aria-haspopup", "dialog");
      h.setAttribute("aria-label", `Menu kolom ${shown[i]?.title ?? ""}`);
    });
  });
  function openFrom(target: EventTarget) {
    const header = (target as Element).closest?.(".crisp-board-col-header");
    const wrap = wrapRef.current;
    if (!header || !wrap) return;
    const i = Array.from(wrap.querySelectorAll(".crisp-board-col-header")).indexOf(header);
    if (!shown[i]) return;
    const r = header.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    setMenu({ stage: shown[i].id, left: r.left - w.left + wrap.scrollLeft, top: r.top - w.top, width: r.width, height: r.height });
  }

  const set = (stage: string, next: Partial<Column>) => setCols((all) => ({ ...all, [stage]: { ...(all[stage] ?? { filters: [] }), ...next } }));
  const st = menu ? cols[menu.stage] ?? { filters: [] } : null;
  const fields = Object.values(c.specs).filter((s) => s.kind !== "none");
  const field = st?.field ? c.specs[st.field] : fields[0];
  const values = useMemo(() => (menu ? valuesOf(byStage.get(menu.stage) ?? []) : {}), [menu, valuesOf, byStage]);

  return (
    <div className="relative flex h-full flex-col" data-sales-v2-board-wrap>
      {hidden.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 px-3 pt-1 text-[0.75rem] text-slate-500">
          Kolom disembunyikan:
          {hidden.map((id) => (
            <button key={id} type="button" className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-700 hover:bg-slate-50" onClick={() => setHidden((h) => h.filter((x) => x !== id))}>
              {board.stages.find((s) => s.id === id)?.title ?? id} · tampilkan
            </button>
          ))}
        </p>
      )}
      <div
        ref={wrapRef}
        className="relative min-h-0 flex-1 px-3 pt-2"
        style={stageVars}
        data-sales-v2-board
        onClickCapture={(e) => openFrom(e.target)}
        onKeyDownCapture={(e) => { if ((e.key === "Enter" || e.key === " ") && (e.target as Element).matches(".crisp-board-col-header")) { e.preventDefault(); openFrom(e.target); } }}
      >
        <Board<Card<T>>
          columns={shown.map((s) => {
            const x = cols[s.id];
            return { id: s.id, title: `${s.title}${x?.filters.length ? " · filter" : ""}${x?.sort ? " · urut" : ""}`, accent: s.accent };
          })}
          cards={cards}
          onCardsChange={onCardsChange}
          getCardLabel={board.cardLabel}
          announceMove={(col, card) => `${card ?? "Kartu"} dipindah ke ${col}`}
          onPreviewCard={(x) => onOpen(x.id)}
          previewCardLabel="Lihat ringkasan"
          renderCard={(x) => board.renderCard(x, () => onOpen(x.id))}
        />
        {menu && st && (
          <div className="absolute" style={{ left: menu.left, top: menu.top, width: menu.width, height: menu.height }}>
            <Popover
              open
              onOpenChange={(o) => !o && setMenu(null)}
              aria-label={`Kolom ${board.stages.find((s) => s.id === menu.stage)?.title}`}
              trigger={<span aria-hidden className="block h-full w-full" />}
            >
              <div className="w-72 p-1 text-[0.8125rem]" data-board-menu={menu.stage}>
                <p className="px-2 pb-1 pt-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-slate-500">Urutkan kartu</p>
                <div className="flex items-center gap-1.5 px-1">
                  <div className="min-w-0 flex-1">
                    <Select
                      aria-label="Urutkan menurut"
                      size="small"
                      value={st.sort?.key ?? ""}
                      placeholder="Urutan bawaan"
                      onValueChange={(key) => set(menu.stage, { sort: key ? { key, dir: st.sort?.dir ?? "asc" } : undefined })}
                      options={[{ value: "", label: "Urutan bawaan" }, ...fields.filter((f) => f.sortable).map((f) => ({ value: f.key, label: f.label }))]}
                    />
                  </div>
                  {st.sort && (
                    <Button size="sm" intent="neutral" aria-label="Balik urutan" onClick={() => set(menu.stage, { sort: { key: st.sort!.key, dir: st.sort!.dir === "asc" ? "desc" : "asc" } })}>
                      {st.sort.dir === "asc" ? <ArrowDownAZ size={14} /> : <ArrowUpAZ size={14} />}
                    </Button>
                  )}
                </div>
                <div className="my-1.5 border-t border-slate-100" />
                <p className="px-2 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-slate-500">Filter kartu di kolom ini</p>
                <div className="px-1 pb-1">
                  <Select aria-label="Filter menurut" size="small" value={field?.key} onValueChange={(key) => set(menu.stage, { field: key })} options={fields.map((f) => ({ value: f.key, label: f.label }))} />
                </div>
                {field && (() => {
                  const onFilters = (filters: ToolbarFilter[]) => set(menu.stage, { filters });
                  if (field.kind === "values") return <ValueList spec={field} values={values[field.key] ?? []} filters={st.filters} onFilters={onFilters} />;
                  if (field.kind === "bool") return <BoolChoice spec={field} filters={st.filters} onFilters={onFilters} />;
                  if (field.kind === "number" || field.kind === "date") return <RangeFields spec={field} filters={st.filters} onFilters={onFilters} />;
                  return <ContainsField spec={field} filters={st.filters} onFilters={onFilters} />;
                })()}
                <div className="my-1 border-t border-slate-100" />
                <div className="flex items-center justify-between gap-2 px-1 py-0.5">
                  <Button size="sm" intent="neutral" disabled={!st.filters.length && !st.sort} onClick={() => set(menu.stage, { filters: [], sort: undefined })}>Hapus filter & urutan</Button>
                  <MenuButton onClick={() => { setHidden((h) => [...h, menu.stage]); setMenu(null); }}><EyeOff size={13} /> Sembunyikan</MenuButton>
                </div>
              </div>
            </Popover>
          </div>
        )}
      </div>
    </div>
  );
}
