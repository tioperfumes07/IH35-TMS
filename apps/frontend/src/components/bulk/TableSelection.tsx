import type { ReactNode } from "react";

export type TableSelectionContext = {
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
};

export type TableSelectionProps<TRow> = {
  rows: TRow[];
  getId: (row: TRow) => string;
  selectedIds: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  /** Visible page row IDs — select-all applies to this list only. */
  pageRowIds?: string[];
  /** Max selectable IDs (200 default; Fleet uses 100). */
  cap?: number;
  onCapExceeded?: (message: string) => void;
  children: (ctx: TableSelectionContext) => ReactNode;
};

const DEFAULT_CAP = 200;

function capMessage(cap: number): string {
  return `You can select up to ${cap} items at a time. Clear some selections and try again.`;
}

function applyWithCap(
  next: Set<string>,
  cap: number,
  onSelectionChange: (next: Set<string>) => void,
  onCapExceeded?: (message: string) => void
) {
  if (next.size > cap) {
    onCapExceeded?.(capMessage(cap));
    return;
  }
  onSelectionChange(next);
}

export function TableSelection<TRow>({
  rows: _rows,
  getId: _getId,
  selectedIds,
  onSelectionChange,
  pageRowIds: _pageRowIds,
  cap = DEFAULT_CAP,
  onCapExceeded,
  children,
}: TableSelectionProps<TRow>) {
  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    applyWithCap(next, cap, onSelectionChange, onCapExceeded);
  };

  return <>{children({ isSelected: (id) => selectedIds.has(id), toggle })}</>;
}

export type TableSelectionHeaderProps = {
  selectedIds: Set<string>;
  pageRowIds: string[];
  /**
   * SEL-01 — when set, the header checkbox selects this full matching set (filtered list),
   * not only the current page. Defaults to pageRowIds (page-scoped) when omitted.
   */
  matchingRowIds?: string[];
  onSelectionChange: (next: Set<string>) => void;
  cap?: number;
  onCapExceeded?: (message: string) => void;
  ariaLabel?: string;
};

export function TableSelectionHeader({
  selectedIds,
  pageRowIds,
  matchingRowIds,
  onSelectionChange,
  cap = DEFAULT_CAP,
  onCapExceeded,
  ariaLabel,
}: TableSelectionHeaderProps) {
  const scopeIds = matchingRowIds ?? pageRowIds;
  const resolvedAria =
    ariaLabel ??
    (matchingRowIds != null
      ? `Select all ${matchingRowIds.length} matching rows`
      : "Select all rows on this page");
  const allScopeSelected =
    scopeIds.length > 0 && scopeIds.every((id) => selectedIds.has(id));
  const someScopeSelected = scopeIds.some((id) => selectedIds.has(id));

  const toggleAllScope = () => {
    if (allScopeSelected) {
      const next = new Set(selectedIds);
      for (const id of scopeIds) next.delete(id);
      applyWithCap(next, cap, onSelectionChange, onCapExceeded);
      return;
    }
    applyWithCap(new Set(scopeIds), cap, onSelectionChange, onCapExceeded);
  };

  return (
    <input
      type="checkbox"
      aria-label={resolvedAria}
      data-testid="table-selection-select-all"
      data-select-scope={matchingRowIds != null ? "matching" : "page"}
      checked={allScopeSelected}
      ref={(el) => {
        if (el) el.indeterminate = someScopeSelected && !allScopeSelected;
      }}
      onChange={toggleAllScope}
    />
  );
}

export function formatSelectedCount(count: number, tooltipIds?: string[]): string {
  if (count <= 0) return "";
  const label = count === 1 ? "1 selected" : `${count} selected`;
  if (!tooltipIds || tooltipIds.length === 0) return label;
  const shown = tooltipIds.slice(0, 20);
  const suffix = tooltipIds.length > 20 ? ` … +${tooltipIds.length - 20} more` : "";
  return `${label} (${shown.join(", ")}${suffix})`;
}

/** @deprecated use TableSelectionHeader */
export function renderTableSelectionHeader(props: TableSelectionHeaderProps) {
  return <TableSelectionHeader {...props} />;
}

export { DEFAULT_CAP as TABLE_SELECTION_DEFAULT_CAP };
