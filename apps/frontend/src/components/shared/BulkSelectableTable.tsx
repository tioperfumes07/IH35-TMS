import type { ReactNode } from "react";
import { BulkActionBar, type BulkActionItem } from "../bulk/BulkActionBar";
import { TableSelection, TableSelectionHeader } from "../bulk/TableSelection";
import { useBulkSelection } from "../../hooks/useBulkSelection";
import type { UseBulkSelectionOptions } from "../../hooks/useBulkSelection";

export type BulkSelectableTableContext = {
  pageRowIds: string[];
  isSelected: (id: string) => boolean;
  toggleRow: (id: string) => void;
  renderHeaderCheckbox: () => ReactNode;
  renderRowCheckbox: (id: string) => ReactNode;
};

export type BulkSelectableTableProps<TRow> = {
  entityType: string;
  rows: TRow[];
  getRowId: (row: TRow) => string;
  /**
   * SEL-01 — when set, header select-all uses this full matching set (e.g. all filtered
   * rows across pages). Defaults to `rows` (page) when omitted.
   */
  matchingRows?: TRow[];
  bulkActions: BulkActionItem[];
  applying?: boolean;
  selectionOptions?: UseBulkSelectionOptions;
  toolbarChildren?: ReactNode;
  className?: string;
  children: (ctx: BulkSelectableTableContext) => ReactNode;
};

export function BulkSelectableTable<TRow>({
  entityType,
  rows,
  getRowId,
  matchingRows,
  bulkActions,
  applying = false,
  selectionOptions,
  toolbarChildren,
  className,
  children,
}: BulkSelectableTableProps<TRow>) {
  const selection = useBulkSelection(selectionOptions);
  const pageRowIds = rows.map(getRowId);
  const matchingRowIds = matchingRows != null ? matchingRows.map(getRowId) : undefined;

  return (
    <div className={className} data-entity-type={entityType} data-bulk-selectable="true">
      <BulkActionBar
        {...selection.bulkActionBarProps(bulkActions, applying)}
        selectedLabel={`${selection.selectedCount} selected`}
      >
        {toolbarChildren}
      </BulkActionBar>
      <TableSelection
        rows={rows}
        getId={getRowId}
        selectedIds={selection.selectedIds}
        onSelectionChange={selection.setSelectedIds}
        pageRowIds={pageRowIds}
        cap={selection.cap}
      >
        {({ isSelected, toggle }) => {
          const ctx: BulkSelectableTableContext = {
            pageRowIds,
            isSelected,
            toggleRow: toggle,
            renderHeaderCheckbox: () => (
              <TableSelectionHeader
                selectedIds={selection.selectedIds}
                pageRowIds={pageRowIds}
                matchingRowIds={matchingRowIds}
                onSelectionChange={selection.setSelectedIds}
                cap={selection.cap}
              />
            ),
            renderRowCheckbox: (id: string) => (
              <input
                type="checkbox"
                aria-label={`Select row ${id}`}
                checked={isSelected(id)}
                onChange={() => toggle(id)}
              />
            ),
          };
          return children(ctx);
        }}
      </TableSelection>
    </div>
  );
}
