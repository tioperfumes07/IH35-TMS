import { useCallback, useMemo, useState } from "react";

export interface SelectionHookResult {
  selected: Set<string>;
  selectAll: boolean;
  selectAllPages: boolean;
  toggleRow: (id: string) => void;
  togglePage: (ids: string[]) => void;
  selectAcrossPages: () => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  selectedCount: number;
}

export function useListSelection(totalRows: number): SelectionHookResult {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectAllPages, setSelectAllPages] = useState(false);

  const toggleRow = useCallback((id: string) => {
    setSelectAllPages(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const togglePage = useCallback((ids: string[]) => {
    setSelectAllPages(false);
    setSelected((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const selectAcrossPages = useCallback(() => {
    setSelectAllPages(true);
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setSelectAllPages(false);
  }, []);

  const isSelected = useCallback(
    (id: string) => selectAllPages || selected.has(id),
    [selected, selectAllPages]
  );

  const selectAll = useMemo(
    () => selected.size > 0 && !selectAllPages,
    [selected.size, selectAllPages]
  );

  const selectedCount = selectAllPages ? totalRows : selected.size;

  return {
    selected,
    selectAll,
    selectAllPages,
    toggleRow,
    togglePage,
    selectAcrossPages,
    clearSelection,
    isSelected,
    selectedCount,
  };
}
