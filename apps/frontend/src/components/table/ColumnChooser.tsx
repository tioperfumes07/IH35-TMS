import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";

// GLOBAL-TABLE-CONTROLS — QuickBooks-style gear menu: rows-per-page + show/hide columns.
export type TableColumn = { key: string; label: string; alwaysVisible?: boolean };

type Props = {
  columns: TableColumn[];
  hidden: Set<string>;
  onToggleColumn: (key: string) => void;
  pageSize: number;
  onPageSizeChange: (n: number) => void;
  pageSizeOptions?: number[];
};

export function ColumnChooser({
  columns,
  hidden,
  onToggleColumn,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100, 200],
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Table settings"
        aria-expanded={open}
        className="flex h-8 items-center gap-1 rounded border border-gray-300 bg-white px-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
        onClick={() => setOpen((o) => !o)}
      >
        <Settings className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded border border-gray-200 bg-white p-2 shadow-lg" role="menu">
          <div className="mb-2">
            <label className="mb-1 block text-[11px] font-semibold text-gray-600">Rows per page</label>
            <select
              className="h-7 w-full rounded border border-gray-300 px-1 text-[12px]"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="mb-1 text-[11px] font-semibold text-gray-600">Columns</div>
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {columns.map((c) => (
              <label
                key={c.key}
                className={`flex items-center gap-2 rounded px-1 py-0.5 text-[12px] ${c.alwaysVisible ? "text-gray-400" : "text-gray-700 hover:bg-gray-50"}`}
              >
                <input
                  type="checkbox"
                  disabled={c.alwaysVisible}
                  checked={c.alwaysVisible || !hidden.has(c.key)}
                  onChange={() => onToggleColumn(c.key)}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
