import { useEffect, useMemo, useState } from "react";
import { useTablePref } from "./useTablePref";
import type { TableColumn } from "./ColumnChooser";

// GLOBAL-TABLE-CONTROLS — the shared controller every list table drives off of.
// Owns: free-text search, client-side pagination, and persisted column visibility +
// page size. The page feeds already-list-filtered rows in; the controller returns the
// paged slice + control state. `searchText` MUST be stable (module-level fn or useCallback).
type Options<T> = {
  rows: T[];
  columns: TableColumn[];
  tableKey: string;
  searchText: (row: T) => string;
  defaultPageSize?: number;
  defaultHidden?: string[];
};

export function useTableController<T>({
  rows,
  columns,
  tableKey,
  searchText,
  defaultPageSize = 50,
  defaultHidden = [],
}: Options<T>) {
  const { pageSize, setPageSize, hidden, toggleColumn } = useTablePref(tableKey, {
    pageSize: defaultPageSize,
    hidden: defaultHidden,
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => searchText(r).toLowerCase().includes(q));
  }, [rows, search, searchText]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  // Reset to page 1 whenever the result set or page size changes.
  useEffect(() => {
    setPage(1);
  }, [search, pageSize, rows.length]);
  // Keep the current page in range if the result set shrinks.
  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), pageCount));
  }, [pageCount]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

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
    filtered,
    paged,
    pageCount,
    filteredCount: filtered.length,
    totalCount: rows.length,
  };
}
