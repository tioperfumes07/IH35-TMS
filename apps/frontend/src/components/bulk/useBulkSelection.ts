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
   * SEL-01 / GO-MECH-0901 — selectAll selects the FULL id set passed in (all matching),
   * capped. It is NOT an alias of selectPage. Call sites that only mean the current page
   * must call selectPage explicitly. Destructive bulk still fail-stop + cap.
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

  /** Deliberate: select an explicit matching set (still capped). Same as selectAll. */
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

  const selectAll = selectMatching;

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
