import { useCallback, useEffect, useMemo, useState } from "react";

type Updater<T> = T | ((current: T) => T);

type Options<T> = {
  applied: T;
  empty: T;
  onApply: (next: T) => void;
};

/** Drafts list filters without changing query-driving state until Apply. */
export function useStagedListFilters<T>({ applied, empty, onApply }: Options<T>) {
  const appliedKey = JSON.stringify(applied);
  const emptyKey = JSON.stringify(empty);
  const stableApplied = useMemo(() => applied, [appliedKey]);
  const stableEmpty = useMemo(() => empty, [emptyKey]);
  const [draft, setDraftState] = useState<T>(stableApplied);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraftState(stableApplied);
  }, [dirty, stableApplied]);

  const setDraft = useCallback((next: Updater<T>) => {
    setDraftState((current) => (typeof next === "function" ? (next as (value: T) => T)(current) : next));
    setDirty(true);
  }, []);

  const apply = useCallback(() => {
    onApply(draft);
    setDirty(false);
  }, [draft, onApply]);

  const cancel = useCallback(() => {
    setDraftState(stableApplied);
    setDirty(false);
  }, [stableApplied]);

  const reset = useCallback(() => {
    setDraftState(stableEmpty);
    setDirty(true);
  }, [stableEmpty]);

  return { draft, setDraft, apply, cancel, reset, dirty };
}
