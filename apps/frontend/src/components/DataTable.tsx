import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { colors, spacing, typography } from "../design/tokens";

type Column<T> = {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  pageSize?: number;
  onRowClick?: (row: T) => void;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  pageSize = 15,
  onRowClick,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

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

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const offset = (safePage - 1) * pageSize;
  const pageRows = sortedRows.slice(offset, offset + pageSize);

  return (
    <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <table className="min-w-full text-left" style={{ fontSize: typography.tableRow }}>
        <thead className="bg-gray-50">
          <tr style={{ height: spacing.tableHeaderHeight }}>
            {columns.map((column) => (
              <th
                key={String(column.key)}
                className={`font-semibold uppercase text-gray-600 ${column.className ?? ""}`}
                style={{ paddingLeft: spacing.tableCellPaddingX, paddingRight: spacing.tableCellPaddingX, fontSize: typography.kpiLabel, letterSpacing: typography.tightUpper }}
              >
                {column.sortable ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
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
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
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
                {columns.map((column) => (
                  <td
                    key={String(column.key)}
                    className={`py-1 text-gray-800 ${column.className ?? ""}`}
                    style={{ paddingLeft: spacing.tableCellPaddingX, paddingRight: spacing.tableCellPaddingX }}
                  >
                    {column.render ? column.render(row) : String((row as Record<string, unknown>)[String(column.key)] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t border-gray-200 px-2 py-1.5 text-[11px] text-gray-600" style={{ color: colors.mutedText }}>
        <span>
          {sortedRows.length === 0 ? 0 : offset + 1}-{Math.min(offset + pageSize, sortedRows.length)} of {sortedRows.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-7 rounded border border-gray-300 px-2 disabled:opacity-40"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={safePage <= 1}
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
            disabled={safePage >= pageCount}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
