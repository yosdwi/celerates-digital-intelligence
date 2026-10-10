"use client";
// Edit-in-place for the record panel (QA 2026-10-08; the table uses Crisp's own cell editors): a coded field shows as
// its chip and an editor clicks it to pick another value (Crisp Menu), a flag is a checkbox, a text or amount turns into
// an input on click (Enter or leaving it saves, Escape cancels). Saving is the workspace's `edit`, as in the table.
// RecordLink is the record's name in the table, its way into the panel.
import { useState } from "react";
import { Check, ChevronDown, MoreHorizontal, Pencil } from "lucide-react";
import { Checkbox, Chip, Input, Menu, MenuItem } from "@crisp-ui-kit/crisp";
import { useRowActions } from "./record-workspace";

type Swatch = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type InlineOption = { value: string; label: string; swatch?: Swatch };

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function InlineSelect({ value, options, label, canEdit, onChange }: {
  value: string;
  options: readonly InlineOption[];
  /** Field name, for the menu's accessible name. */
  label: string;
  canEdit: boolean;
  onChange: (value: string) => void;
}) {
  const current = options.find((o) => o.value === value);
  const shown = !current ? <span className="text-slate-400">-</span> : current.swatch ? <Chip swatch={current.swatch}>{current.label}</Chip> : <span className="truncate">{current.label}</span>;
  if (!canEdit) return shown;
  return (
    <span className="inline-flex max-w-full" onClick={stop} onKeyDown={stop} data-inline-edit>
      <Menu
        aria-label={label}
        trigger={
          <button type="button" className="group inline-flex max-w-full items-center gap-0.5 rounded px-0.5 hover:bg-slate-100" aria-label={`${label}: ${current?.label ?? "kosong"}, ubah`}>
            {shown}
            <ChevronDown size={12} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60" aria-hidden />
          </button>
        }
      >
        {options.map((o) => (
          <MenuItem key={o.value} onSelect={() => o.value !== value && onChange(o.value)} trailingIcon={o.value === value ? <Check size={13} /> : undefined}>
            {o.label}
          </MenuItem>
        ))}
      </Menu>
    </span>
  );
}

export function InlineCheck({ checked, label, canEdit, onChange }: { checked: boolean; label: string; canEdit: boolean; onChange: (checked: boolean) => void }) {
  if (!canEdit) return checked ? <span className="font-medium text-emerald-700">{label}</span> : <span className="text-slate-400">Belum</span>;
  return (
    <label className="inline-flex items-center gap-1.5" onClick={stop} onKeyDown={stop} data-inline-edit>
      <Checkbox checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} aria-label={label} />
      <span className={checked ? "font-medium text-emerald-700" : "text-slate-400"}>{checked ? label : "Belum"}</span>
    </label>
  );
}

/** The record's name as its link to the panel (Attio: the name opens the record; a click elsewhere selects a cell). */
export function RecordLink({ id, children }: { id: string; children: React.ReactNode }) {
  const { open } = useRowActions();
  return (
    <button type="button" className="max-w-full truncate text-left font-medium text-slate-900 hover:text-brand-700 hover:underline" onClick={(e) => { e.stopPropagation(); open(id); }} data-record-link>
      {children}
    </button>
  );
}

export function InlineText({ value, display, label, canEdit, numeric, onCommit }: {
  value: string;
  /** What shows at rest (e.g. a formatted amount); the raw value otherwise. */
  display?: React.ReactNode;
  label: string;
  canEdit: boolean;
  numeric?: boolean;
  onCommit: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const shown = display ?? (value || "-");
  if (!canEdit) return <>{shown}</>;
  const commit = (v: string) => { setEditing(false); if (v !== value) onCommit(v); };
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="group inline-flex max-w-full items-center gap-1 rounded px-0.5 text-left hover:bg-slate-100" aria-label={`${label}: ${value || "kosong"}, ubah`} data-inline-edit>
        <span className="truncate">{shown}</span>
        <Pencil size={11} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60" aria-hidden />
      </button>
    );
  }
  return (
    <Input
      autoFocus
      aria-label={label}
      defaultValue={value}
      inputMode={numeric ? "numeric" : undefined}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(e.currentTarget.value); }
        // Escape cancels this edit only (not the panel).
        if (e.key === "Escape") { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setEditing(false); }
      }}
    />
  );
}

/** The panel's ⋯: its less frequent and destructive actions, out of the footer's way. */
export function MoreMenu({ items }: { items: { label: string; onSelect: () => void; danger?: boolean }[] }) {
  if (!items.length) return null;
  return (
    <Menu align="end" aria-label="Aksi lain" trigger={<button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100" aria-label="Aksi lain"><MoreHorizontal size={16} /></button>}>
      {items.map((i) => <MenuItem key={i.label} danger={i.danger} onSelect={i.onSelect}>{i.label}</MenuItem>)}
    </Menu>
  );
}
