import type { ReactNode } from "react";

// FILTER-MULTI-01 (owner, live-measured 2026-09-23 — app-wide TOOLBAR-ONE, the same ruling already
// applied to Banking 2026-09-06 and never swept past it): every money list gets ONE always-visible
// toolbar row — one search box, its filter dropdowns (MultiSelectDropdown/DateRangePresets), and
// one "Clear all". Never a popover — CollapsedListFilters' "Filters (N)" button hides every control
// behind a click, which is the exact defect this replaces. Mount ParityTable with
// `suppressToolbarSearch` + `suppressToolbarRange` alongside this so its own native search/range
// never renders a second, competing control.
export type MoneyListToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchTestId?: string;
  /** MultiSelectDropdown / DateRangePresets / other visible filter controls, rendered inline. */
  children: ReactNode;
  onClearAll: () => void;
  /** Count of non-search filters currently active — drives whether "Clear all" renders. */
  activeFilterCount: number;
  testIdPrefix?: string;
  className?: string;
};

export function MoneyListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  searchTestId,
  children,
  onClearAll,
  activeFilterCount,
  testIdPrefix = "money-list",
  className,
}: MoneyListToolbarProps) {
  const hasAnyActive = activeFilterCount > 0 || search.trim().length > 0;
  return (
    <div
      className={`flex flex-wrap items-end gap-3 ${className ?? ""}`}
      data-testid={`${testIdPrefix}-toolbar`}
      data-money-list-toolbar="visible"
    >
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={searchPlaceholder}
        className="h-9 w-56 rounded-sm border border-gray-300 px-2 text-xs"
        aria-label={searchPlaceholder}
        data-testid={searchTestId ?? `${testIdPrefix}-search-input`}
      />
      {children}
      {hasAnyActive ? (
        <button
          type="button"
          className="h-9 rounded-sm border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          onClick={onClearAll}
          data-testid={`${testIdPrefix}-clear-all`}
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}
