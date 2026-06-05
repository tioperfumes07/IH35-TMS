import type { ReactNode } from "react";
import { useColumnWidths } from "../../hooks/useColumnWidths";
import { ResizableTh } from "./ResizableTh";

export type ResizableColumn = {
  id: string;
  label: ReactNode;
  defaultWidth?: number;
  align?: "left" | "center" | "right";
  className?: string;
};

type Props = {
  tableId: string;
  columns: ResizableColumn[];
  children: (columnWidths: Record<string, number>) => ReactNode;
  className?: string;
  tableClassName?: string;
};

export function ResizableTable({ tableId, columns, children, className, tableClassName = "w-full text-left text-xs" }: Props) {
  const defaultWidths = Object.fromEntries(
    columns.map((col) => [col.id, col.defaultWidth ?? 120])
  );
  const { widths, setWidth, minWidth, maxWidth } = useColumnWidths(tableId, defaultWidths);

  return (
    <div className={className} data-resizable-table={tableId}>
      <table className={tableClassName}>
        <thead>
          <tr>
            {columns.map((column) => (
              <ResizableTh
                key={column.id}
                columnId={column.id}
                width={widths[column.id] ?? column.defaultWidth ?? 120}
                minWidth={minWidth}
                maxWidth={maxWidth}
                onWidthChange={(id, w) => setWidth(id, w)}
                className={column.className}
                align={column.align}
              >
                {column.label}
              </ResizableTh>
            ))}
          </tr>
        </thead>
        {children(widths)}
      </table>
    </div>
  );
}
