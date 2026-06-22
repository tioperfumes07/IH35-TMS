import type { ReactNode } from "react";
import type { ListViewColumn } from "../types";

interface Props<T> {
  row: T;
  rowKey: string;
  columns: ListViewColumn<T>[];
  columnWidths: Record<string, number>;
  columnOrder: string[];
  visibleColumns: Record<string, boolean>;
  isSelected: boolean;
  onToggleSelect: () => void;
  density: "cozy" | "compact";
  pinnedIds: string[];
  badgeSlot?: (row: T) => ReactNode;
}

export function ListViewRow<T>({
  row,
  rowKey,
  columns,
  columnWidths,
  columnOrder,
  visibleColumns,
  isSelected,
  onToggleSelect,
  density,
  pinnedIds,
  badgeSlot,
}: Props<T>) {
  const ordered = [
    ...columnOrder.filter((id) => pinnedIds.includes(id)),
    ...columnOrder.filter((id) => !pinnedIds.includes(id)),
  ].filter((id) => {
    const col = columns.find((c) => c.id === id);
    return col && visibleColumns[id] !== false;
  });

  const rowHeight = density === "compact" ? "h-6" : "h-[32px]";
  const textSize = density === "compact" ? "text-[11px]" : "text-xs";

  return (
    <tr
      className={`${rowHeight} border-b border-gray-100 hover:bg-gray-50 transition-colors ${isSelected ? "bg-slate-100" : ""}`}
      data-row-key={rowKey}
    >
      <td className="w-8 px-2 py-0">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          aria-label={`Select row ${rowKey}`}
          className="rounded border-gray-300"
        />
      </td>
      {ordered.map((colId) => {
        const col = columns.find((c) => c.id === colId);
        if (!col) return null;
        const width = columnWidths[colId] ?? col.width ?? 120;
        const isPinned = pinnedIds.includes(colId);
        const cellValue = (row as Record<string, unknown>)[colId];

        return (
          <td
            key={colId}
            style={{
              width,
              minWidth: width,
              maxWidth: width,
              position: isPinned ? "sticky" : undefined,
              left: isPinned ? 0 : undefined,
              zIndex: isPinned ? 2 : undefined,
            }}
            className={`px-2 py-0 truncate ${textSize} text-gray-800 ${isPinned ? "bg-white shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" : ""}`}
          >
            <div className="flex items-center gap-1 overflow-hidden">
              {col.render ? col.render(row) : <span className="truncate">{String(cellValue ?? "")}</span>}
              {badgeSlot && colId === ordered[0] && badgeSlot(row)}
            </div>
          </td>
        );
      })}
    </tr>
  );
}
