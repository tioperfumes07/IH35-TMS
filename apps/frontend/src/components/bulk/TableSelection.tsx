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
  onSelectionChange: (next: Set<string>) => void;
  cap?: number;
  onCapExceeded?: (message: string) => void;
  ariaLabel?: string;
};

export function TableSelectionHeader({
  selectedIds,
  pageRowIds,
  onSelectionChange,
  cap = DEFAULT_CAP,
  onCapExceeded,
  ariaLabel = "Select all rows on this page",
}: TableSelectionHeaderProps) {
  const allVisibleSelected =
    pageRowIds.length > 0 && pageRowIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = pageRowIds.some((id) => selectedIds.has(id));

  const toggleAllVisible = () => {
    const next = new Set(selectedIds);
    if (allVisibleSelected) {
      for (const id of pageRowIds) next.delete(id);
    } else {
      for (const id of pageRowIds) next.add(id);
    }
    applyWithCap(next, cap, onSelectionChange, onCapExceeded);
  };

  return (
    <input
      type="checkbox"
      aria-label={ariaLabel}
      checked={allVisibleSelected}
      ref={(el) => {
        if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
      }}
      onChange={toggleAllVisible}
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
