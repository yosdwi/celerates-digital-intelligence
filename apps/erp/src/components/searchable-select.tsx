"use client";
import { useEffect, useRef, useState } from "react";
import { Search, ChevronDown, X } from "lucide-react";

export type SearchableOption = { value: string; label: string; sublabel?: string };

/**
 * Select dengan pencarian teks -- ketik untuk filter daftar opsi.
 * Bisa dipakai controlled (value + onChange) atau uncontrolled (defaultValue),
 * sama seperti native <select>.
 */
export function SearchableSelect({
  name,
  options,
  value,
  defaultValue,
  onChange,
  placeholder = "Cari...",
  required,
}: {
  name: string;
  options: SearchableOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const currentValue = isControlled ? value! : internalValue;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === currentValue);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = query.trim()
    ? options.filter((o) => (o.label + " " + (o.sublabel ?? "")).toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  function selectOption(opt: SearchableOption) {
    if (!isControlled) setInternalValue(opt.value);
    onChange?.(opt.value);
    setOpen(false);
    setQuery("");
  }

  function clearSelection(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isControlled) setInternalValue("");
    onChange?.("");
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={currentValue} />
      <div
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 cursor-text bg-white"
      >
        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <input
          type="text"
          value={open ? query : (selectedOption?.label ?? "")}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { setOpen(true); setQuery(""); }}
          placeholder={selectedOption && !open ? selectedOption.label : placeholder}
          required={required && !currentValue}
          className="flex-1 min-w-0 outline-none bg-transparent"
          autoComplete="off"
        />
        {currentValue && !open && (
          <button type="button" onClick={clearSelection} className="text-slate-400 hover:text-red-600 shrink-0" title="Hapus pilihan">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      </div>

      {open && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">Tidak ditemukan</div>}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => selectOption(o)}
              className={`block w-full text-left px-3 py-2 text-sm hover:bg-brand-50 ${o.value === currentValue ? "bg-brand-50 font-medium text-brand-700" : "text-slate-700"}`}
            >
              {o.label}
              {o.sublabel && <span className="block text-xs text-slate-400">{o.sublabel}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
