import { useMemo, useState } from "react";
import { ResizableTh } from "../../../components/shared/ResizableTh";
import { useColumnWidths } from "../../../hooks/useColumnWidths";
import type { RunnerColumn } from "./runner-config";

type Props = {
  columns: RunnerColumn[];
  rows: Record<string, unknown>[];
  onSort?: (key: string) => void;
  tableId?: string;
};

const currencyFormatter = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", year: "numeric" });

function formatCell(value: unknown, format: RunnerColumn["format"]) {
  if (value == null) return "";
  if (format === "currency") return currencyFormatter.format(Number(value) / 100);
  if (format === "percent") return `${numberFormatter.format(Number(value))}%`;
  if (format === "number") return numberFormatter.format(Number(value));
  if (format === "date") {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : dateFormatter.format(d);
  }
  return String(value);
}

export function RunnerTable({ columns, rows, onSort, tableId = "reports-runner" }: Props) {
  const [sortKey, setSortKey] = useState<string>("");
  const [direction, setDirection] = useState<"asc" | "desc" | "none">("none");
  const defaultWidths = Object.fromEntries(columns.map((column) => [column.key, 140]));
  const { widths, setWidth, minWidth, maxWidth } = useColumnWidths(tableId, defaultWidths);

  const sortedRows = useMemo(() => {
    if (!sortKey || direction === "none") return rows;
    const next = [...rows];
    next.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const an = Number(av);
      const bn = Number(bv);
      const cmp = Number.isFinite(an) && Number.isFinite(bn) ? an - bn : String(av ?? "").localeCompare(String(bv ?? ""));
      return direction === "asc" ? cmp : -cmp;
    });
    return next;
  }, [rows, sortKey, direction]);

  function toggleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key);
      setDirection("asc");
      onSort?.(key);
      return;
    }
    if (direction === "asc") {
      setDirection("desc");
      onSort?.(key);
      return;
    }
    if (direction === "desc") {
      setDirection("none");
      return;
    }
    setDirection("asc");
    onSort?.(key);
  }

  return (
    <div className="overflow-hidden rounded border border-slate-200 bg-white" data-resizable-table={tableId}>
      <table className="min-w-full text-left text-xs">
        <thead className="bg-slate-50">
          <tr className="border-b border-slate-200 text-slate-600">
            {columns.map((column) => (
              <ResizableTh
                key={column.key}
                columnId={column.key}
                width={widths[column.key] ?? 140}
                minWidth={minWidth}
                maxWidth={maxWidth}
                onWidthChange={(id, w) => setWidth(id, w)}
                align={column.align === "right" ? "right" : column.align === "center" ? "center" : "left"}
                className="px-3 py-2 font-semibold"
              >
                {column.sortable ? (
                  <button type="button" onClick={() => toggleSort(column.key)} className="inline-flex items-center gap-1">
                    {column.label}
                    {sortKey === column.key ? (direction === "asc" ? "▲" : direction === "desc" ? "▼" : "") : ""}
                  </button>
                ) : (
                  column.label
                )}
              </ResizableTh>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-4 text-center text-slate-500">
                No results for these filters
              </td>
            </tr>
          ) : (
            sortedRows.map((row, rowIndex) => (
              <tr key={String(row.id ?? rowIndex)} className={`border-b border-slate-100 ${rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    style={{ width: widths[column.key] ?? 140, maxWidth: widths[column.key] ?? 140 }}
                    className={`truncate px-3 py-2 text-slate-700 ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}
                  >
                    {formatCell(row[column.key], column.format)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
