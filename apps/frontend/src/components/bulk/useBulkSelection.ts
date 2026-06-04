import { useCallback, useMemo, useState } from "react";

export type BulkSelectionCapError = {
  code: "SELECTION_CAP_EXCEEDED";
  cap: number;
  attempted: number;
  message: string;
};

export type UseBulkSelectionOptions = {
  /** Max selectable IDs (200 default; Fleet uses 100). */
  cap?: number;
  onCapExceeded?: (error: BulkSelectionCapError) => void;
};

export function useBulkSelection(options: UseBulkSelectionOptions = {}) {
  const cap = options.cap ?? 200;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const emitCapError = useCallback(
    (attempted: number) => {
      options.onCapExceeded?.({
        code: "SELECTION_CAP_EXCEEDED",
        cap,
        attempted,
        message: `You can select up to ${cap} items at a time. Clear some selections and try again.`,
      });
    },
    [cap, options.onCapExceeded]
  );

  const wouldExceedCap = useCallback(
    (next: Set<string>) => next.size > cap,
    [cap]
  );

  const toggle = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
          return next;
        }
        next.add(id);
        if (wouldExceedCap(next)) {
          emitCapError(next.size);
          return prev;
        }
        return next;
      });
    },
    [emitCapError, wouldExceedCap]
  );

  const selectPage = useCallback(
    (ids: string[]) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        if (wouldExceedCap(next)) {
          emitCapError(next.size);
          return prev;
        }
        return next;
      });
    },
    [emitCapError, wouldExceedCap]
  );

  const deselectPage = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const selectAll = selectPage;

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const count = selectedIds.size;

  return useMemo(
    () => ({
      selectedIds,
      setSelectedIds,
      toggle,
      selectPage,
      selectAll,
      deselectPage,
      clear,
      count,
      cap,
    }),
    [cap, clear, count, deselectPage, selectAll, selectPage, selectedIds, setSelectedIds, toggle]
  );
}
