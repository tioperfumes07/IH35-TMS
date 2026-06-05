import { useMemo } from "react";
import type { BulkActionItem } from "../components/bulk/BulkActionBar";
import {
  useBulkSelection as useBulkSelectionBase,
  type BulkSelectionCapError,
  type UseBulkSelectionOptions,
} from "../components/bulk/useBulkSelection";

export type { BulkSelectionCapError, UseBulkSelectionOptions };

export function useBulkSelection(options: UseBulkSelectionOptions = {}) {
  const base = useBulkSelectionBase(options);

  return useMemo(
    () => ({
      selectedIds: base.selectedIds,
      selectedCount: base.count,
      count: base.count,
      cap: base.cap,
      setSelectedIds: base.setSelectedIds,
      isSelected: (id: string) => base.selectedIds.has(id),
      toggleRow: base.toggle,
      toggle: base.toggle,
      toggleAll: base.selectPage,
      selectPage: base.selectPage,
      selectAll: base.selectAll,
      deselectPage: base.deselectPage,
      clearSelection: base.clear,
      clear: base.clear,
      isAllSelected: (allIds: string[]) =>
        allIds.length > 0 && allIds.every((id) => base.selectedIds.has(id)),
      isIndeterminate: (allIds: string[]) => {
        const some = allIds.some((id) => base.selectedIds.has(id));
        const all = allIds.length > 0 && allIds.every((id) => base.selectedIds.has(id));
        return some && !all;
      },
      bulkActionBarProps: (actions: BulkActionItem[], applying = false) => ({
        selectedCount: base.count,
        actions,
        onClear: base.clear,
        applying,
      }),
    }),
    [base]
  );
}
