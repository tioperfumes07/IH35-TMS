import { useCallback, useRef } from "react";
import type { ListViewColumn } from "../types";

const MIN_WIDTH = 60;
const MAX_WIDTH = 800;

interface Props<T> {
  columns: ListViewColumn<T>[];
  columnWidths: Record<string, number>;
  columnOrder: string[];
  visibleColumns: Record<string, boolean>;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (id: string) => void;
  onWidthChange: (id: string, width: number) => void;
  dragHandleProps: (id: string) => {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  dragOverId: string | null;
  allPageSelected: boolean;
  onTogglePage: () => void;
  density: "cozy" | "compact";
  pinnedIds: string[];
}

export function ListViewHeader<T>({
  columns,
  columnWidths,
  columnOrder,
  visibleColumns,
  sortKey,
  sortDir,
  onSort,
  onWidthChange,
  dragHandleProps,
  dragOverId,
  allPageSelected,
  onTogglePage,
  density,
  pinnedIds,
}: Props<T>) {
  const ordered = [
    ...columnOrder.filter((id) => pinnedIds.includes(id)),
    ...columnOrder.filter((id) => !pinnedIds.includes(id)),
  ].filter((id) => {
    const col = columns.find((c) => c.id === id);
    return col && visibleColumns[id] !== false;
  });

  const rowHeight = density === "compact" ? "h-[28px]" : "h-9";
  const textSize = density === "compact" ? "text-[10px]" : "text-[11px]";

  return (
    <thead>
      <tr className={`${rowHeight} border-b border-gray-200 bg-gray-50 sticky top-0 z-10`}>
        <th className="w-8 px-2 py-0">
          <input
            type="checkbox"
            checked={allPageSelected}
            onChange={onTogglePage}
            aria-label="Select all on this page"
            className="rounded border-gray-300"
          />
        </th>
        {ordered.map((colId) => {
          const col = columns.find((c) => c.id === colId);
          if (!col) return null;
          const width = columnWidths[colId] ?? col.width ?? 120;
          const isPinned = pinnedIds.includes(colId);
          const isSorted = sortKey === colId;
          const dh = dragHandleProps(colId);

          return (
            <ResizableTh
              key={colId}
              colId={colId}
              width={width}
              isPinned={isPinned}
              isDragOver={dragOverId === colId}
              dragHandleProps={dh}
              onWidthChange={onWidthChange}
              minWidth={MIN_WIDTH}
              maxWidth={MAX_WIDTH}
              textSize={textSize}
              rowHeight={rowHeight}
              hasSort={!!col.sortType}
              isSorted={isSorted}
              sortDir={sortDir}
              onSort={() => col.sortType && onSort(colId)}
            >
              {col.label}
            </ResizableTh>
          );
        })}
      </tr>
    </thead>
  );
}

interface ResizableThProps {
  colId: string;
  width: number;
  isPinned: boolean;
  isDragOver: boolean;
  dragHandleProps: {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  onWidthChange: (id: string, width: number) => void;
  minWidth: number;
  maxWidth: number;
  textSize: string;
  rowHeight: string;
  hasSort: boolean;
  isSorted: boolean;
  sortDir: "asc" | "desc";
  onSort: () => void;
  children: React.ReactNode;
}

function ResizableTh({
  colId,
  width,
  isPinned,
  isDragOver,
  dragHandleProps,
  onWidthChange,
  minWidth,
  maxWidth,
  textSize,
  hasSort,
  isSorted,
  sortDir,
  onSort,
  children,
}: ResizableThProps) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startXRef.current = e.clientX;
      startWidthRef.current = width;

      const onMove = (me: MouseEvent) => {
        const delta = me.clientX - startXRef.current;
        const next = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
        onWidthChange(colId, next);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [colId, maxWidth, minWidth, onWidthChange, width]
  );

  return (
    <th
      {...dragHandleProps}
      style={{ width, minWidth: width, maxWidth: width, position: isPinned ? "sticky" : undefined, left: isPinned ? 0 : undefined, zIndex: isPinned ? 11 : undefined }}
      className={`relative select-none font-medium tracking-wide uppercase text-gray-500 bg-gray-50 ${textSize} ${isDragOver ? "bg-slate-100 border-l-2 border-slate-300" : ""}`}
      data-column-id={colId}
    >
      <div className="flex items-center gap-1 px-2 overflow-hidden">
        <button
          type="button"
          onClick={hasSort ? onSort : undefined}
          className={`flex items-center gap-1 truncate ${hasSort ? "cursor-pointer hover:text-gray-800" : "cursor-default"}`}
        >
          <span className="truncate">{children}</span>
          {isSorted && (
            <span className="shrink-0 text-slate-700">{sortDir === "asc" ? "▲" : "▼"}</span>
          )}
        </button>
      </div>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${colId}`}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-[#1F2A44]"
        onMouseDown={onResizeMouseDown}
      />
    </th>
  );
}
