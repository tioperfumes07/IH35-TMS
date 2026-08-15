import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { singleFrameLayoutClassName } from "../../lib/single-frame-classname";

type BaseProps = {
  /** Non-search filters currently applied (drives badge on Filters button). */
  activeFilterCount: number;
  /** Popover body — filter chips, date range, etc. */
  children: ReactNode;
  /** Optional inline search slot (TableSearch) kept visible in the slim toolbar. */
  searchSlot?: ReactNode;
  testIdPrefix?: string;
  className?: string;
  /** e.g. { "data-customers-filter-toolbar": "collapsed" } */
  dataAttributes?: Record<string, string>;
};

type Props = BaseProps & (
  | { onApply: () => void; onReset: () => void; onCancel: () => void; applyDisabled?: boolean; applyLawExemptReason?: never }
  | { applyLawExemptReason: "QBO_SYNC_OUT_OF_SCOPE"; onApply?: never; onReset?: never; onCancel?: never; applyDisabled?: never }
);

/**
 * CHROME-02 — QBO-style collapsed list filters (Dispatch FilterBar / SafetyDashboardFilter pattern).
 * Slim toolbar: optional search + Filters popover toggle. All filter chips live in the panel.
 */
export function CollapsedListFilters({
  activeFilterCount,
  children,
  searchSlot,
  testIdPrefix = "list",
  className = "",
  dataAttributes,
  onApply = () => {},
  onReset = () => {},
  onCancel = () => {},
  applyDisabled = false,
  applyLawExemptReason,
}: Props) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const layoutClassName = singleFrameLayoutClassName(className);

  const cancelAndClose = useCallback(() => {
    onCancel();
    setFiltersOpen(false);
  }, [onCancel]);

  useEffect(() => {
    if (!filtersOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cancelAndClose();
    };
    document.addEventListener("mousedown", onDoc);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelAndClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [cancelAndClose, filtersOpen]);

  return (
    <div ref={ref} className={`relative ${layoutClassName ?? ""}`} {...dataAttributes}>
      <div className="flex flex-wrap items-center gap-2">
        {searchSlot}
        <button
          type="button"
          aria-expanded={filtersOpen}
          data-testid={`${testIdPrefix}-filters-toggle`}
          onClick={() => setFiltersOpen((o) => !o)}
          className="flex h-8 items-center gap-1 rounded-sm border border-gray-300 bg-white px-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Filters
          {activeFilterCount > 0 ? (
            <span className="ml-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-[#1F2A44] px-1 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
      </div>

      {filtersOpen ? (
        <div
          className="absolute left-0 z-30 mt-1 w-[min(560px,90vw)] space-y-3 rounded-sm border border-gray-200 bg-white p-3 shadow-lg"
          data-testid={`${testIdPrefix}-filters-panel`}
        >
          {children}
          {applyLawExemptReason ? null : <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
            <button type="button" className="rounded-sm px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100" onClick={onReset}>
              Reset
            </button>
            <button type="button" className="rounded-sm border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50" onClick={cancelAndClose}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded-sm bg-[#1F2A44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#172036] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={applyDisabled}
              onClick={() => {
                onApply();
                setFiltersOpen(false);
              }}
            >
              Apply
            </button>
          </div>}
        </div>
      ) : null}
    </div>
  );
}
