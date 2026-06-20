import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { colors, spacing, typography } from "../design/tokens";
import type { DataTableErrorState } from "../lib/tableError";
import { ListErrorState } from "./ListErrorState";
import { useTablePref } from "./table/useTablePref";

export type { DataTableErrorState };

// Universal rows-per-page choices (Jorge: every list lets the user pick how many rows show). -1 = "All".
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, -1] as const;
const ALL_SENTINEL = -1;
const pageSizeLabel = (n: number) => (n === ALL_SENTINEL ? "All" : String(n));

type Column<T> = {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  className?: string;
  cellClass?: string;
  /**
   * GLOBAL-TABLE-ALIGNMENT (Block A, Jorge LOCKED option 2): explicit per-column alignment.
   * Numeric columns (hours HH:MM, money, dates, counts) right-align so digits line up by place value;
   * everything else centers by default. `numeric` is a convenience flag === align:"right" + tabular-nums.
   * The HEADER follows the column's data alignment automatically (see resolveAlign).
   */
  align?: "left" | "center" | "right";
  numeric?: boolean;
};

// GLOBAL-TABLE-ALIGNMENT — single source of truth for column alignment. Flip the default the other way
// (all-center) by changing the one `?? "center"` fallback below; numeric still wins where set.
export function resolveAlign(col: { align?: "left" | "center" | "right"; numeric?: boolean }): {
  textClass: string;
  justifyClass: string;
  numeric: boolean;
} {
  const a = col.align ?? (col.numeric ? "right" : "center");
  const numeric = col.numeric === true || a === "right";
  const textClass = a === "right" ? "text-right" : a === "left" ? "text-left" : "text-center";
  const justifyClass = a === "right" ? "justify-end" : a === "left" ? "justify-start" : "justify-center";
  return { textClass, justifyClass, numeric };
}

type DataTableProps<T> = {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  pageSize?: number;
  /** When set, the user's rows-per-page choice persists per-surface (localStorage, same store as column widths). */
  tableKey?: string;
  onRowClick?: (row: T) => void;
  errorState?: DataTableErrorState;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  pageSize = 15,
  tableKey,
  onRowClick,
  errorState,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  // Rows-per-page: persisted per-surface when a tableKey is given; otherwise ephemeral local state.
  const pref = useTablePref(tableKey ?? "datatable:adhoc", { pageSize });
  const [localPageSize, setLocalPageSize] = useState(pageSize);
  const selectedPageSize = tableKey ? pref.pageSize : localPageSize;
  const setSelectedPageSize = (n: number) => {
    setPage(1);
    if (tableKey) pref.setPageSize(n);
    else setLocalPageSize(n);
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const aValue = String((a as Record<string, unknown>)[sortKey] ?? "");
      const bValue = String((b as Record<string, unknown>)[sortKey] ?? "");
      const comparison = aValue.localeCompare(bValue);
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return copy;
  }, [rows, sortKey, sortDirection]);

  // "All" (-1) shows every row; otherwise the chosen page size.
  const effectivePageSize = selectedPageSize === ALL_SENTINEL ? Math.max(1, sortedRows.length) : selectedPageSize;
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / effectivePageSize));
  const safePage = Math.min(page, pageCount);
  const offset = (safePage - 1) * effectivePageSize;
  const pageRows = sortedRows.slice(offset, offset + effectivePageSize);
  const inError = Boolean(errorState);
  const footerRowsLength = inError ? 0 : sortedRows.length;

  return (
    <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <table className="w-full table-fixed text-left" style={{ fontSize: typography.tableRow }}>
        <thead className="bg-gray-50">
          <tr style={{ height: spacing.tableHeaderHeight }}>
            {columns.map((column) => {
              const a = resolveAlign(column);
              return (
              <th
                key={String(column.key)}
                className={`font-semibold uppercase text-gray-600 ${a.textClass} ${a.numeric ? "tabular-nums" : ""} ${column.className ?? ""}`}
                style={{
                  paddingLeft: spacing.tableCellPaddingX,
                  paddingRight: spacing.tableCellPaddingX,
                  fontSize: typography.kpiLabel,
                  letterSpacing: typography.tightUpper,
                }}
              >
                {column.sortable ? (
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 ${a.justifyClass} w-full`}
                    onClick={() => {
                      const key = String(column.key);
                      if (sortKey === key) {
                        setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
                      } else {
                        setSortKey(key);
                        setSortDirection("asc");
                      }
                    }}
                  >
                    {column.label}
                    {sortKey === String(column.key) ? (sortDirection === "asc" ? "▲" : "▼") : null}
                  </button>
                ) : (
                  column.label
                )}
              </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {inError && errorState ? (
            <tr>
              <td colSpan={columns.length} className="p-0">
                <ListErrorState
                  title="Couldn't load list"
                  status={errorState.status}
                  message={errorState.message}
                  onRetry={errorState.onRetry}
                />
              </td>
            </tr>
          ) : loading ? (
            <tr>
                  <td colSpan={columns.length} className="px-2 py-3 text-center text-[11px] text-gray-500">
                Loading...
              </td>
            </tr>
          ) : pageRows.length === 0 ? (
            <tr>
                  <td colSpan={columns.length} className="px-2 py-3 text-center text-[11px] text-gray-500">
                No records found.
              </td>
            </tr>
          ) : (
            pageRows.map((row) => (
              <tr
                key={rowKey(row)}
                className={`border-t border-gray-100 ${onRowClick ? "cursor-pointer hover:bg-gray-50" : ""}`}
                style={{ height: spacing.tableRowHeight }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => {
                  const a = resolveAlign(column);
                  return (
                  <td
                    key={String(column.key)}
                    className={`overflow-hidden break-all py-1 align-top text-gray-800 ${a.textClass} ${a.numeric ? "tabular-nums" : ""} ${column.cellClass ?? column.className ?? ""}`}
                    style={{ paddingLeft: spacing.tableCellPaddingX, paddingRight: spacing.tableCellPaddingX }}
                  >
                    {column.render ? column.render(row) : String((row as Record<string, unknown>)[String(column.key)] ?? "")}
                  </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t border-gray-200 px-2 py-1.5 text-[11px] text-gray-600" style={{ color: colors.mutedText }}>
        <div className="flex items-center gap-2">
          <span>
            {inError
              ? "—"
              : footerRowsLength === 0
                ? `0 of ${footerRowsLength}`
                : `${offset + 1}-${Math.min(offset + effectivePageSize, footerRowsLength)} of ${footerRowsLength}`}
          </span>
          {/* Universal rows-per-page selector (10/25/50/100/All) — persists per-surface when tableKey is set. */}
          <label className="flex items-center gap-1 text-[11px] text-gray-500">
            Rows
            <select
              aria-label="Rows per page"
              className="h-6 rounded border border-gray-300 bg-white px-1 text-[11px]"
              value={selectedPageSize}
              onChange={(e) => setSelectedPageSize(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{pageSizeLabel(n)}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-7 rounded border border-gray-300 px-2 disabled:opacity-40"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={inError || safePage <= 1}
          >
            Prev
          </button>
          <span>
            Page {safePage} / {pageCount}
          </span>
          <button
            type="button"
            className="h-7 rounded border border-gray-300 px-2 disabled:opacity-40"
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            disabled={inError || safePage >= pageCount}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
