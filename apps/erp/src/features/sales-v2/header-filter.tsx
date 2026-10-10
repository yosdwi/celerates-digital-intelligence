"use client";
// Excel-style column header for the V2 table: the header itself opens a Crisp Popover with sort, the column's own
// filter (value checklist, range or text) and Hide. Filters are ordinary toolbar filters (model.ts), so they also show
// as toolbar chips, live in the URL and apply to Grid and Kanban too.
import { useMemo, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, ArrowDown, ArrowUp, EyeOff, ListFilter, type LucideIcon } from "lucide-react";
import { Button, Checkbox, Input, Popover, type ToolbarFilter, type ToolbarSort } from "@crisp-ui-kit/crisp";
import { checkedValues, isHeaderFilter, setCheckedValues, setContains, setRange } from "./model";

export type FilterKind = "values" | "bool" | "number" | "date" | "text" | "none";

export type HeaderSpec = {
  key: string;
  label: string;
  icon: LucideIcon;
  kind: FilterKind;
  align?: "left" | "center" | "right";
  sortable: boolean;
};

const BLANK = "(Kosong)";

export function HeaderFilter({
  spec, values, filters, sorts, onFilters, onSorts, onHide, showIcon,
}: {
  spec: HeaderSpec;
  /** Distinct values with their record counts (values and bool kinds). */
  values: [string, number][];
  filters: ToolbarFilter[];
  sorts: ToolbarSort[];
  onFilters: (next: ToolbarFilter[]) => void;
  onSorts: (next: ToolbarSort[]) => void;
  /** Absent for a frozen column, which is always shown. */
  onHide?: () => void;
  /** The toolbar's Filter is on: every header shows its ▼, as in Google Sheets. A filtered column shows it anyway. */
  showIcon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = filters.some((f) => isHeaderFilter(f, spec.key)) || (spec.kind === "bool" && filters.some((f) => f.key === spec.key));
  const dir = sorts.find((s) => s.key === spec.key)?.dir;
  const Icon = spec.icon;
  const justify = spec.align === "right" ? "justify-end" : spec.align === "center" ? "justify-center" : "justify-start";
  const numeric = spec.kind === "number" || spec.kind === "date";

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align={spec.align === "right" ? "end" : "start"}
      aria-label={`Kolom ${spec.label}`}
      trigger={
        <button type="button" className={`flex h-full w-full items-center gap-1.5 ${justify}`} data-header-filter={spec.key} data-active={active || undefined}>
          <Icon size={14} strokeWidth={1.75} className="shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{spec.label}</span>
          {dir && (dir === "asc" ? <ArrowUp size={12} aria-label="naik" /> : <ArrowDown size={12} aria-label="turun" />)}
          {(showIcon || active) && (
            <span
              className={`ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border ${active ? "border-[#2356e8] bg-[#2356e8] text-white" : "border-slate-300 bg-white text-slate-500"}`}
              aria-label={active ? "difilter" : "filter"}
              data-header-filter-icon
            >
              <ListFilter size={12} strokeWidth={2} aria-hidden />
            </span>
          )}
        </button>
      }
    >
      <div className="w-64 p-1 text-[0.8125rem]" data-header-menu={spec.key}>
        {spec.sortable && (
          <div className="flex flex-col">
            <MenuButton onClick={() => { onSorts([{ key: spec.key, dir: "asc" }]); setOpen(false); }} pressed={dir === "asc"}>
              <ArrowDownAZ size={14} /> {numeric ? "Terkecil → terbesar" : "Urutkan A → Z"}
            </MenuButton>
            <MenuButton onClick={() => { onSorts([{ key: spec.key, dir: "desc" }]); setOpen(false); }} pressed={dir === "desc"}>
              <ArrowUpAZ size={14} /> {numeric ? "Terbesar → terkecil" : "Urutkan Z → A"}
            </MenuButton>
            {dir && <MenuButton onClick={() => { onSorts(sorts.filter((s) => s.key !== spec.key)); setOpen(false); }}>Hapus urutan</MenuButton>}
          </div>
        )}
        {spec.kind !== "none" && <div className="my-1 border-t border-slate-100" />}
        {spec.kind === "values" && <ValueList spec={spec} values={values} filters={filters} onFilters={onFilters} />}
        {spec.kind === "bool" && <BoolChoice spec={spec} filters={filters} onFilters={onFilters} />}
        {numeric && <RangeFields spec={spec} filters={filters} onFilters={onFilters} />}
        {spec.kind === "text" && <ContainsField spec={spec} filters={filters} onFilters={onFilters} />}
        <div className="my-1 border-t border-slate-100" />
        <div className="flex items-center justify-between gap-2 px-1 py-0.5">
          <Button size="sm" intent="neutral" disabled={!active} onClick={() => onFilters(filters.filter((f) => !isHeaderFilter(f, spec.key) && !(spec.kind === "bool" && f.key === spec.key)))}>
            Hapus filter
          </Button>
          {onHide && (
            <Button size="sm" intent="neutral" onClick={() => { setOpen(false); onHide(); }}>
              <EyeOff size={13} /> Sembunyikan
            </Button>
          )}
        </div>
      </div>
    </Popover>
  );
}

export function MenuButton({ children, onClick, pressed }: { children: React.ReactNode; onClick: () => void; pressed?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} className={`flex h-8 items-center gap-2 rounded-md px-2 text-left hover:bg-slate-100 ${pressed ? "font-semibold text-[#194667]" : "text-slate-700"}`}>
      {children}
    </button>
  );
}

/** Excel's AutoFilter list: search, Pilih semua, one checkbox per distinct value with its count. Applies at once. */
export function ValueList({ spec, values, filters, onFilters }: { spec: HeaderSpec; values: [string, number][]; filters: ToolbarFilter[]; onFilters: (f: ToolbarFilter[]) => void }) {
  const [q, setQ] = useState("");
  const all = useMemo(() => values.map(([v]) => v), [values]);
  const checked = checkedValues(filters, spec.key, all);
  const shown = values.filter(([v]) => (v || BLANK).toLowerCase().includes(q.trim().toLowerCase()));
  const apply = (next: Set<string>) => next.size && onFilters(setCheckedValues(filters, spec.key, all, next));
  const allShownOn = shown.every(([v]) => checked.has(v));
  return (
    <div className="px-1">
      <Input size="sm" type="search" placeholder="Cari nilai…" aria-label={`Cari nilai ${spec.label}`} value={q} onChange={(e) => setQ(e.currentTarget.value)} autoFocus />
      <label className="mt-1 flex h-8 items-center gap-2 rounded-md px-1 font-medium text-slate-800 hover:bg-slate-50">
        <Checkbox
          checked={allShownOn}
          indeterminate={!allShownOn && shown.some(([v]) => checked.has(v))}
          onChange={() => {
            const next = new Set(checked);
            for (const [v] of shown) (allShownOn ? next.delete(v) : next.add(v));
            apply(next);
          }}
        />
        Pilih semua{q ? " (hasil cari)" : ""}
      </label>
      <ul className="max-h-56 overflow-y-auto" role="list">
        {shown.map(([v, n]) => (
          <li key={v}>
            <label className="flex h-8 items-center gap-2 rounded-md px-1 text-slate-700 hover:bg-slate-50">
              <Checkbox
                checked={checked.has(v)}
                disabled={checked.size === 1 && checked.has(v)}
                onChange={() => {
                  const next = new Set(checked);
                  if (next.has(v)) next.delete(v); else next.add(v);
                  apply(next);
                }}
              />
              <span className={`min-w-0 flex-1 truncate ${v ? "" : "italic text-slate-400"}`}>{v || BLANK}</span>
              <span className="text-[0.6875rem] tabular-nums text-slate-400">{n}</span>
            </label>
          </li>
        ))}
        {!shown.length && <li className="px-1 py-2 text-slate-400">Tidak ada nilai.</li>}
      </ul>
    </div>
  );
}

export function BoolChoice({ spec, filters, onFilters }: { spec: HeaderSpec; filters: ToolbarFilter[]; onFilters: (f: ToolbarFilter[]) => void }) {
  const current = filters.find((f) => f.key === spec.key && (f.op === "istrue" || f.op === "isfalse"))?.op ?? "all";
  const set = (op: "all" | "istrue" | "isfalse") => {
    const rest = filters.filter((f) => f.key !== spec.key);
    onFilters(op === "all" ? rest : [...rest, { id: `h:${spec.key}`, key: spec.key, op, value: "" }]);
  };
  const yes = spec.key === "converted" ? "Sudah" : "Qualified";
  const no = spec.key === "converted" ? "Belum" : "Belum";
  return (
    <div className="flex flex-col px-1" role="radiogroup" aria-label={spec.label}>
      {([["all", "Semua"], ["istrue", yes], ["isfalse", no]] as const).map(([op, label]) => (
        <MenuButton key={op} onClick={() => set(op)} pressed={current === op}>{label}</MenuButton>
      ))}
    </div>
  );
}

export function RangeFields({ spec, filters, onFilters }: { spec: HeaderSpec; filters: ToolbarFilter[]; onFilters: (f: ToolbarFilter[]) => void }) {
  const own = filters.filter((f) => isHeaderFilter(f, spec.key));
  const [min, setMin] = useState(own.find((f) => f.op === "greaterthan" || f.op === "after")?.value ?? "");
  const [max, setMax] = useState(own.find((f) => f.op === "lessthan" || f.op === "before")?.value ?? "");
  const date = spec.kind === "date";
  return (
    <form className="grid grid-cols-2 gap-2 px-1 pb-1" onSubmit={(e) => { e.preventDefault(); onFilters(setRange(filters, spec.key, date ? "date" : "number", min, max)); }}>
      <label className="text-[0.6875rem] font-medium text-slate-500">{date ? "Setelah" : "Lebih dari"}
        <Input size="sm" type={date ? "date" : "number"} value={min} onChange={(e) => setMin(e.currentTarget.value)} />
      </label>
      <label className="text-[0.6875rem] font-medium text-slate-500">{date ? "Sebelum" : "Kurang dari"}
        <Input size="sm" type={date ? "date" : "number"} value={max} onChange={(e) => setMax(e.currentTarget.value)} />
      </label>
      <Button type="submit" size="sm" intent="primary" className="col-span-2">Terapkan</Button>
    </form>
  );
}

export function ContainsField({ spec, filters, onFilters }: { spec: HeaderSpec; filters: ToolbarFilter[]; onFilters: (f: ToolbarFilter[]) => void }) {
  const [text, setText] = useState(filters.find((f) => isHeaderFilter(f, spec.key))?.value ?? "");
  return (
    <form className="flex gap-2 px-1 pb-1" onSubmit={(e) => { e.preventDefault(); onFilters(setContains(filters, spec.key, text)); }}>
      <Input size="sm" placeholder="Mengandung…" aria-label={`${spec.label} mengandung`} value={text} onChange={(e) => setText(e.currentTarget.value)} autoFocus />
      <Button type="submit" size="sm" intent="primary">Terapkan</Button>
    </form>
  );
}
