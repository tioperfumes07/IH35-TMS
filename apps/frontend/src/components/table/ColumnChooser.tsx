import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "../Button";
import { TOOLBAR_ICON_SIZE_CLASS } from "../../design/tokens";

// GLOBAL-TABLE-CONTROLS — QuickBooks-style gear menu: rows-per-page + show/hide columns.
// GLOBAL-TABLE-ALIGNMENT (Block A): `numeric`/`align` let a consumer mark a column once; the shared
// TableHeaderCell then right-aligns the header over right-aligned numeric data (hours, money, dates,
// counts). Default (unset) = center. See resolveAlign in DataTable.tsx.
export type TableColumn = {
  key: string;
  label: string;
  alwaysVisible?: boolean;
  align?: "left" | "center" | "right";
  numeric?: boolean;
};

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
  pageSizeOptions = [25, 50, 100, 300],
}: Props) {
  const [open, setOpen] = useState(false);
  const [draftHidden, setDraftHidden] = useState<Set<string>>(() => new Set(hidden));
  const [draftPageSize, setDraftPageSize] = useState(pageSize);
  const ref = useRef<HTMLDivElement>(null);

  const cancel = () => {
    setDraftHidden(new Set(hidden));
    setDraftPageSize(pageSize);
    setOpen(false);
  };

  const apply = () => {
    for (const column of columns) {
      if (column.alwaysVisible) continue;
      if (hidden.has(column.key) !== draftHidden.has(column.key)) onToggleColumn(column.key);
    }
    if (draftPageSize !== pageSize) onPageSizeChange(draftPageSize);
    setOpen(false);
  };

  const reset = () => {
    setDraftHidden(new Set());
    setDraftPageSize(pageSizeOptions[0] ?? pageSize);
  };

  useEffect(() => {
    if (!open) return;
    setDraftHidden(new Set(hidden));
    setDraftPageSize(pageSize);
  }, [hidden, open, pageSize]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cancel();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [hidden, open, pageSize]);

  return (
    <div className="relative" ref={ref}>
      {/* UI CONTROL LAW — was a hand-rolled gear button at its own ad-hoc size with a 14px icon.
          Now the shared Button primitive + the locked 16px toolbar icon size (same conversion as
          ParityTable's own gear). */}
      <Button
        type="button"
        variant="tertiary"
        size="icon"
        aria-label="Table settings"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Settings className={TOOLBAR_ICON_SIZE_CLASS} aria-hidden />
      </Button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-sm border border-gray-200 bg-white p-2 shadow-lg" role="menu">
          <div className="mb-2">
            <label htmlFor="column-chooser-page-size" className="mb-1 block text-[11px] font-semibold text-gray-600">Rows per page</label>
            <select
              id="column-chooser-page-size"
              className="h-7 w-full rounded-sm border border-gray-300 px-1 text-xs"
              value={draftPageSize}
              onChange={(e) => setDraftPageSize(Number(e.target.value))}
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
                className={`flex items-center gap-2 rounded-sm px-1 py-0.5 text-xs ${c.alwaysVisible ? "text-gray-400" : "text-gray-700 hover:bg-gray-50"}`}
              >
                <input
                  type="checkbox"
                  disabled={c.alwaysVisible}
                  checked={c.alwaysVisible || !draftHidden.has(c.key)}
                  onChange={() => setDraftHidden((current) => {
                    const next = new Set(current);
                    if (next.has(c.key)) next.delete(c.key);
                    else next.add(c.key);
                    return next;
                  })}
                />
                {c.label}
              </label>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-end gap-2 border-t border-gray-200 pt-2">
            {/* UI CONTROL LAW — was 3 hand-rolled buttons at a fourth ad-hoc size (px-2 py-1, no
                shared height token). Now the real Button primitive, one scale with every other
                toolbar action. */}
            <Button type="button" variant="tertiary" size="sm" onClick={reset}>Reset</Button>
            <Button type="button" variant="secondary" size="sm" onClick={cancel}>Cancel</Button>
            <Button type="button" variant="primary" size="sm" onClick={apply}>Apply</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
