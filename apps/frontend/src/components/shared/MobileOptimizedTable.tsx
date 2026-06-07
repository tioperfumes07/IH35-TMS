import type { ReactNode } from "react";

type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  cardLabel?: string;
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
};

export function MobileOptimizedTable<T>({ rows, columns, rowKey, emptyMessage = "No rows" }: Props<T>) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">{emptyMessage}</p>;
  }

  return (
    <div className="mobile-table-fallback w-full" data-testid="mobile-optimized-table">
      <div className="hidden overflow-x-auto sm:block">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="border-b px-3 py-2 text-left font-semibold text-gray-600">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-gray-100">
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 align-top">
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 sm:hidden">
        {rows.map((row) => (
          <article key={rowKey(row)} className="rounded border border-gray-200 bg-white p-3 shadow-sm">
            {columns.map((col) => (
              <div key={col.key} className="mb-2 last:mb-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {col.cardLabel ?? col.header}
                </p>
                <div className="text-sm text-gray-900">{col.render(row)}</div>
              </div>
            ))}
          </article>
        ))}
      </div>
    </div>
  );
}
