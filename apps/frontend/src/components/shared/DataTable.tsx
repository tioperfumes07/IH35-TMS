/**
 * GO-UI-CONSISTENCY-WHOLE-APP-2026-08-31: shared DataTable primitive.
 * Extracted from the existing <thead> convention used across 41 files.
 * Standard pattern: overflow-x-auto + border + table + thead bg-slate-50 + tbody.
 *
 * Columns: DATE · DRIVER · LOAD NUMBER · SETTLEMENT/BILL NUMBER · AMOUNT · STATUS
 * (per owner spec for settlements). Each column header is sortable.
 */
import { useMemo, useState, type ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
  sortable?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowTestId?: (row: T) => string | undefined;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowTestId,
  emptyMessage = "No rows.",
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const displayedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((candidate) => candidate.key === sort.key);
    if (!column?.sortable || !column.sortValue) return rows;
    return rows
      .map((row, index) => ({ row, index, value: column.sortValue?.(row) }))
      .sort((left, right) => {
        if (left.value == null && right.value == null) return left.index - right.index;
        if (left.value == null) return 1;
        if (right.value == null) return -1;
        const result =
          typeof left.value === "number" && typeof right.value === "number"
            ? left.value - right.value
            : String(left.value).localeCompare(String(right.value), undefined, {
                numeric: true,
                sensitivity: "base",
              });
        return result === 0
          ? left.index - right.index
          : sort.direction === "asc"
            ? result
            : -result;
      })
      .map(({ row }) => row);
  }, [columns, rows, sort]);

  const changeSort = (column: DataTableColumn<T>) => {
    if (!column.sortable || !column.sortValue) return;
    setSort((current) =>
      current?.key === column.key
        ? { key: column.key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key: column.key, direction: "asc" },
    );
  };

  if (rows.length === 0) {
    return <p className="text-xs text-gray-500">{emptyMessage}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-2 py-2 ${col.className ?? ""}`}
                aria-sort={
                  sort?.key === col.key
                    ? sort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : col.sortable
                      ? "none"
                      : undefined
                }
              >
                {col.sortable && col.sortValue ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold uppercase"
                    onClick={() => changeSort(col)}
                  >
                    {col.header}
                    <span aria-hidden="true">
                      {sort?.key === col.key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayedRows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-t border-slate-100 hover:bg-slate-50"
              data-testid={rowTestId?.(row)}
            >
              {columns.map((col) => (
                <td key={col.key} className={`px-2 py-2 ${col.className ?? ""}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
