import { useEffect, useMemo, useState } from "react";
import { useTablePref } from "./useTablePref";
import type { TableColumn } from "./ColumnChooser";

// GLOBAL-TABLE-CONTROLS — the shared controller every list table drives off of.
// Owns: free-text search, click-header sort, client-side pagination, and persisted
// column visibility + page size + widths. The page feeds already-list-filtered rows in;
// the controller returns the sorted+paged slice + control state.
// `searchText` and `sortValue` MUST be stable (module-level fn or useCallback).
export type SortDir = "asc" | "desc";

type Options<T> = {
  rows: T[];
  columns: TableColumn[];
  tableKey: string;
  searchText: (row: T) => string;
  /** Per-column sort key extractor. Return null/undefined to sort such rows last. */
  sortValue?: (row: T, key: string) => string | number | null | undefined;
  defaultPageSize?: number;
  defaultHidden?: string[];
};

function compareValues(a: string | number | null | undefined, b: string | number | null | undefined): number {
  const aNull = a == null || a === "";
  const bNull = b == null || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1; // nulls last
  if (bNull) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function useTableController<T>({
  rows,
  columns,
  tableKey,
  searchText,
  sortValue,
  defaultPageSize = 50,
  defaultHidden = [],
}: Options<T>) {
  const { pageSize, setPageSize, hidden, toggleColumn, widths, setColumnWidth } = useTablePref(tableKey, {
    pageSize: defaultPageSize,
    hidden: defaultHidden,
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Click a header: asc → desc → unsorted, cycling.
  const toggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => searchText(r).toLowerCase().includes(q));
  }, [rows, search, searchText]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortValue) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => dir * compareValues(sortValue(a, sortKey), sortValue(b, sortKey)));
  }, [filtered, sortKey, sortDir, sortValue]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));

  // Reset to page 1 whenever the result set, sort, or page size changes.
  useEffect(() => {
    setPage(1);
  }, [search, pageSize, rows.length, sortKey, sortDir]);
  // Keep the current page in range if the result set shrinks.
  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), pageCount));
  }, [pageCount]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => c.alwaysVisible || !hidden.has(c.key)),
    [columns, hidden]
  );

  const isColumnVisible = (key: string) => {
    const c = columns.find((x) => x.key === key);
    return Boolean(c?.alwaysVisible) || !hidden.has(key);
  };

  return {
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    hidden,
    toggleColumn,
    columns,
    visibleColumns,
    isColumnVisible,
    // sort
    sortKey,
    sortDir,
    toggleSort,
    // column widths (resize)
    widths,
    setColumnWidth,
    filtered: sorted,
    paged,
    pageCount,
    filteredCount: sorted.length,
    totalCount: rows.length,
  };
}
