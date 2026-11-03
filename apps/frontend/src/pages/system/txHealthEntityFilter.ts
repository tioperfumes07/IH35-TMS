/**
 * Transaction Health entity checkboxes — explicit all / subset / none.
 *
 * Codex batch42: empty `string[]` previously meant "all" in the UI/API, but toggle(A) from
 * that state became `[A]` (isolate A) instead of "all except A". Unchecking the last chip
 * then restored `[]` = all again. null = all; [] = none; [ids] = only those.
 */
export type TxHealthEntityFilter = string[] | null;

export function toggleTxHealthEntityFilter(
  prev: TxHealthEntityFilter,
  id: string,
  allIds: string[],
): TxHealthEntityFilter {
  if (prev === null) {
    return allIds.filter((x) => x !== id);
  }
  if (prev.includes(id)) {
    return prev.filter((x) => x !== id);
  }
  const next = [...prev, id];
  if (allIds.length > 0 && allIds.every((x) => next.includes(x))) return null;
  return next;
}

export function txHealthEntityChecked(filter: TxHealthEntityFilter, id: string): boolean {
  return filter === null || filter.includes(id);
}

/** Subset or none — filter is active (banner on). null = every company. */
export function txHealthEntityFilterActive(filter: TxHealthEntityFilter): boolean {
  return filter !== null;
}

/** API: null → omit/empty params (all). [] → caller must short-circuit (API empty also means all). */
export function txHealthEntityIdsForApi(filter: TxHealthEntityFilter): string[] {
  return filter ?? [];
}
