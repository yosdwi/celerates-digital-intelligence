"use client";
import { useState, useMemo } from "react";

export type SortDirection = "asc" | "desc";

export function useTableFilter<T extends Record<string, unknown>>(data: T[], pageSize: number = 20) {
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFiltersRaw] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const filtered = useMemo(() => {
    const rows = data.filter((row) => {
      if (query.trim()) {
        const matchesSearch = Object.values(row).some(
          (v) => v != null && String(v).toLowerCase().includes(query.toLowerCase())
        );
        if (!matchesSearch) return false;
      }
      for (const [key, value] of Object.entries(activeFilters)) {
        if (value && String(row[key] ?? "") !== value) return false;
      }
      return true;
    });

    if (!sortKey) return rows;

    // Null/undefined selalu ditaruh paling belakang apa pun arah sortnya --
    // biar data kosong nggak "mendominasi" urutan atas cuma karena diurut asc.
    const sorted = [...rows].sort((a, b) => {
      const av = a[sortKey] as unknown;
      const bv = b[sortKey] as unknown;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      let cmp: number;
      if (av instanceof Date && bv instanceof Date) cmp = av.getTime() - bv.getTime();
      else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else if (typeof av === "boolean" && typeof bv === "boolean") cmp = Number(av) - Number(bv);
      else cmp = String(av).localeCompare(String(bv), "id", { numeric: true });

      return sortDirection === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [data, query, activeFilters, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  function setQueryAndReset(v: string) { setQuery(v); setPage(1); }
  function setActiveFilters(updater: (prev: Record<string, string>) => Record<string, string>) {
    setActiveFiltersRaw(updater);
    setPage(1);
  }

  /** Reset search + semua filter dropdown sekaligus -- tidak menyentuh sort. */
  function resetFilters() {
    setQuery("");
    setActiveFiltersRaw({});
    setPage(1);
  }

  /**
   * Siklus standar 3 langkah per kolom: klik 1x -> asc, klik 2x -> desc,
   * klik 3x -> balik ke urutan normal/default (sortKey null lagi). Klik
   * kolom lain sementara masih ke-sort -> langsung mulai dari asc di kolom baru.
   */
  function toggleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection("asc");
      return;
    }
    if (sortDirection === "asc") {
      setSortDirection("desc");
    } else {
      setSortKey(null);
      setSortDirection("asc");
    }
  }

  const hasActiveFilters = query.trim() !== "" || Object.values(activeFilters).some((v) => !!v);

  return {
    query, setQuery: setQueryAndReset,
    activeFilters, setActiveFilters,
    filtered, paginated,
    page: safePage, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters,
    sortKey, sortDirection, toggleSort,
  };
}
