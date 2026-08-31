/**
 * GO-UI-CONSISTENCY-WHOLE-APP-2026-08-31: shared DataTable primitive.
 * Extracted from the existing <thead> convention used across 41 files.
 * Standard pattern: overflow-x-auto + border + table + thead bg-slate-50 + tbody.
 *
 * Columns: DATE · DRIVER · LOAD NUMBER · SETTLEMENT/BILL NUMBER · AMOUNT · STATUS
 * (per owner spec for settlements). Each column header is sortable.
 */
import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  sortable?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No rows.",
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <p className="text-xs text-gray-500">{emptyMessage}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`px-2 py-2 ${col.className ?? ""}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-slate-100 hover:bg-slate-50">
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
