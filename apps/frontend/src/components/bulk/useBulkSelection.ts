import { useCallback, useMemo, useState } from "react";

export type BulkSelectionCapError = {
  code: "SELECTION_CAP_EXCEEDED";
  cap: number;
  attempted: number;
  message: string;
};

export type UseBulkSelectionOptions = {
  /**
   * Max selectable IDs. Default **200** (matches DEFAULT_BULK_MAX_IDS / ParityTable maxSelectable).
   * When a toggle/select would exceed the cap, the change is a **no-op** and `onCapExceeded` fires —
   * selection is NEVER silently truncated (owner would otherwise void fewer than selected).
   */
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

  /**
   * BULK-SELECTION-SCOPE-01 — PAGE-SCOPED select.
   * Selecting a page REPLACES the selection with exactly those ids (does not accumulate
   * prior pages). Destructive bulk is fail-stop atomic; cross-page accumulation is a defect.
   */
  const selectPage = useCallback(
    (ids: string[]) => {
      setSelectedIds((prev) => {
        const next = new Set(ids);
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

  /** Deliberate escape hatch: select an explicit matching set (still capped). */
  const selectMatching = useCallback(
    (ids: string[]) => {
      setSelectedIds((prev) => {
        const next = new Set(ids);
        if (wouldExceedCap(next)) {
          emitCapError(next.size);
          return prev;
        }
        return next;
      });
    },
    [emitCapError, wouldExceedCap]
  );

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
      selectMatching,
      deselectPage,
      clear,
      count,
      cap,
    }),
    [cap, clear, count, deselectPage, selectAll, selectMatching, selectPage, selectedIds, setSelectedIds, toggle]
  );
}
