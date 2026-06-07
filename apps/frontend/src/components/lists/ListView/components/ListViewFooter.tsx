import type { ListViewColumn, PaginationConfig } from "../types";

interface Props<T> {
  columns: ListViewColumn<T>[];
  columnWidths: Record<string, number>;
  columnOrder: string[];
  visibleColumns: Record<string, boolean>;
  rows: T[];
  selectedRows: T[];
  selectAllPages: boolean;
  showTotals: boolean;
  pagination: PaginationConfig;
  density: "cozy" | "compact";
  colSpanOffset?: number;
}

function sumColumn<T>(rows: T[], colId: string): number | null {
  let hasNumeric = false;
  let total = 0;
  for (const row of rows) {
    const raw = (row as Record<string, unknown>)[colId];
    const stripped = parseFloat(String(raw ?? "").replace(/[$,\s]/g, ""));
    if (!isNaN(stripped)) {
      hasNumeric = true;
      total += stripped;
    }
  }
  return hasNumeric ? total : null;
}

function formatSum(value: number): string {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return value.toFixed(2);
}

const PAGE_SIZE_OPTIONS = [50, 75, 100, 200, 300];

export function ListViewFooter<T>({
  columns,
  columnWidths,
  columnOrder,
  visibleColumns,
  rows,
  selectedRows,
  selectAllPages,
  showTotals,
  pagination,
  density,
  colSpanOffset = 1,
}: Props<T>) {
  const summaryRows = selectAllPages ? rows : selectedRows.length > 0 ? selectedRows : rows;
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));

  const orderedVisible = columnOrder.filter((id) => {
    const col = columns.find((c) => c.id === id);
    return col && visibleColumns[id] !== false;
  });

  const rowHeight = density === "compact" ? "h-[28px]" : "h-9";
  const textSize = density === "compact" ? "text-[10px]" : "text-[11px]";

  return (
    <tfoot>
      {showTotals && (
        <tr className={`${rowHeight} border-t-2 border-gray-300 bg-gray-50 font-semibold`}>
          <td className="px-2 py-0 text-gray-500 text-xs" colSpan={colSpanOffset}>
            {selectedRows.length > 0 && !selectAllPages
              ? `${selectedRows.length} selected`
              : "Totals"}
          </td>
          {orderedVisible.map((colId) => {
            const col = columns.find((c) => c.id === colId);
            if (!col) return null;
            const width = columnWidths[colId] ?? col.width ?? 120;
            const sum =
              col.sortType === "number" || col.sortType === "currency"
                ? sumColumn(summaryRows, colId)
                : null;
            return (
              <td
                key={colId}
                style={{ width, minWidth: width, maxWidth: width }}
                className={`px-2 py-0 truncate text-right ${textSize} text-gray-800`}
              >
                {sum !== null ? formatSum(sum) : ""}
              </td>
            );
          })}
        </tr>
      )}
      <tr className="h-10 border-t border-gray-200 bg-white">
        <td colSpan={orderedVisible.length + colSpanOffset} className="px-3 py-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>
                {pagination.total === 0
                  ? "No rows"
                  : `${(pagination.page - 1) * pagination.pageSize + 1}–${Math.min(
                      pagination.page * pagination.pageSize,
                      pagination.total
                    )} of ${pagination.total}`}
              </span>
              <span className="text-gray-300">|</span>
              <label className="flex items-center gap-1">
                Rows:
                <select
                  value={pagination.pageSize}
                  onChange={(e) => pagination.onPageSizeChange(Number(e.target.value))}
                  className="border border-gray-300 rounded text-xs px-1 py-0.5"
                >
                  {PAGE_SIZE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-1">
              <PageButton
                label="«"
                onClick={() => pagination.onPageChange(1)}
                disabled={pagination.page <= 1}
              />
              <PageButton
                label="‹"
                onClick={() => pagination.onPageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
              />
              <span className="text-xs text-gray-600 px-2">
                {pagination.page} / {totalPages}
              </span>
              <PageButton
                label="›"
                onClick={() => pagination.onPageChange(pagination.page + 1)}
                disabled={pagination.page >= totalPages}
              />
              <PageButton
                label="»"
                onClick={() => pagination.onPageChange(totalPages)}
                disabled={pagination.page >= totalPages}
              />
            </div>
          </div>
        </td>
      </tr>
    </tfoot>
  );
}

function PageButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-8 h-8 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}
