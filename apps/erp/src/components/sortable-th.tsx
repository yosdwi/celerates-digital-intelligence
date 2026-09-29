"use client";
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import type { SortDirection } from "@/hooks/use-table-filter";

/**
 * <th> yang isinya bisa diklik buat sort -- dipakai bareng sortKey/sortDirection/
 * toggleSort dari useTableFilter. className tetap dipasang di <th> aslinya
 * (termasuk sticky/min-w/z-index kalau kolomnya nempel), jadi drop-in
 * pengganti <th className="...">Label</th> biasa.
 */
export function SortableTh({
  label,
  sortKey,
  activeSortKey,
  direction,
  onSort,
  className = "",
}: {
  label: React.ReactNode;
  sortKey: string;
  activeSortKey: string | null;
  direction: SortDirection;
  onSort: (key: string) => void;
  className?: string;
}) {
  const isActive = activeSortKey === sortKey;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 transition-colors ${isActive ? "text-violet-900" : "hover:text-violet-900"}`}
      >
        {label}
        {isActive ? (
          direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}
