"use client";
// Quick edits inside table cells (QA 2026-10-08), so rows stay one line: a coded field shows as its chip and an editor
// clicks it to pick another value (Crisp Menu); a flag is a checkbox. Clicks here never reach the row, which opens the
// record panel. Saving goes through the workspace's `run` (optimistic, V1 action, refresh).
import { Check, ChevronDown } from "lucide-react";
import { Checkbox, Chip, Menu, MenuItem } from "@crisp-ui-kit/crisp";

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
