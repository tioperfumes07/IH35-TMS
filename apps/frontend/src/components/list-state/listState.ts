// Shared list-state primitive (BLOCK LIST-EMPTY-1).
//
// Root cause it fixes: paged lists (Vendors first, then Customers) rendered
// "No vendors found · 0-0 of 0" *while the roster fetch was still in flight* —
// the empty state showed before the query settled, telling the user data does
// not exist when it simply had not loaded.
//
// The single invariant enforced here: the EMPTY state is returned ONLY when the
// query has SETTLED (not pending, not error, not actively fetching) with zero
// rows. It can never be returned mid-fetch. Error is surfaced honestly and is
// never collapsed into empty.

export type ListState = "loading" | "error" | "empty" | "data";

/** Minimal react-query status this module reads. */
export type ListQueryStatus = {
  /** react-query v5: true while the query has produced no data yet (initial load / disabled). */
  isPending: boolean;
  /** true when the query settled in an error state. */
  isError: boolean;
  /** true while any fetch (initial or background) is in flight. Optional; defaults to false. */
  isFetching?: boolean;
};

/**
 * Resolve the render state for a paged list.
 *
 * empty is returned ONLY on a settled, successful, non-fetching query with zero
 * rows. Priority: error → loading (pending or still-fetching-into-empty) → empty → data.
 */
export function resolveListState(status: ListQueryStatus, isEmpty: boolean): ListState {
  if (status.isError) return "error";
  if (status.isPending) return "loading";
  // Zero rows while a fetch is still in flight is NOT settled — keep showing loading
  // rather than flashing an empty state that a moment later fills with data.
  if (isEmpty && status.isFetching) return "loading";
  return isEmpty ? "empty" : "data";
}

/** Narrow a full react-query result to the minimal status {@link resolveListState} needs. */
export function listQueryStatus(query: {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
}): ListQueryStatus {
  return { isPending: query.isPending, isError: query.isError, isFetching: query.isFetching };
}
