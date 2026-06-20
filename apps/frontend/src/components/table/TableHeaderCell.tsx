import { useCallback, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { SortDir } from "./useTableController";
import { resolveAlign } from "../DataTable";

// GLOBAL-TABLE-CONTROLS — shared sortable + resizable <th>. Click to sort (asc→desc→off),
// drag the right edge to resize. Width persists per-user via the controller/useTablePref.
// GLOBAL-TABLE-ALIGNMENT (Block A): the header follows its column's data alignment. Numeric columns
// (hours HH:MM, money, dates, counts) right-align so the header sits over right-aligned digits;
// everything else centers by default. Alignment logic is centralized in resolveAlign (DataTable.tsx).
type Props = {
  columnKey: string;
  label: string;
  sortable?: boolean;
  resizable?: boolean;
  sortKey: string | null;
  sortDir: SortDir;
  onToggleSort: (key: string) => void;
  width?: number;
  onResize?: (key: string, width: number) => void;
  className?: string;
  align?: "left" | "center" | "right";
  numeric?: boolean;
};

export function TableHeaderCell({
  columnKey,
  label,
  sortable = true,
  resizable = true,
  sortKey,
  sortDir,
  onToggleSort,
  width,
  onResize,
  className = "",
  align,
  numeric,
}: Props) {
  const thRef = useRef<HTMLTableCellElement>(null);
  const active = sortKey === columnKey;
  const a = resolveAlign({ align, numeric });

  const startResize = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = thRef.current?.getBoundingClientRect().width ?? width ?? 120;
      const onMove = (ev: MouseEvent) => onResize?.(columnKey, startWidth + (ev.clientX - startX));
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [columnKey, onResize, width]
  );

  return (
    <th
      ref={thRef}
      className={`relative px-2 py-1 ${a.textClass} ${a.numeric ? "tabular-nums" : ""} ${className}`}
      style={width ? { width } : undefined}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
    >
      <span
        className={`inline-flex w-full select-none items-center gap-0.5 ${a.justifyClass} ${sortable ? "cursor-pointer hover:text-gray-900" : ""}`}
        onClick={sortable ? () => onToggleSort(columnKey) : undefined}
      >
        {label}
        {sortable && active ? (
          sortDir === "asc" ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />
        ) : null}
      </span>
      {resizable && onResize ? (
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${label} column`}
          onMouseDown={startResize}
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none hover:bg-blue-300"
        />
      ) : null}
    </th>
  );
}
