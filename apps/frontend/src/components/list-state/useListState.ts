import { useMemo } from "react";
import { resolveListState, type ListQueryStatus, type ListState } from "./listState";

export type UseListStateResult = {
  state: ListState;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  isData: boolean;
};

/**
 * Derive the four-way list render state from a react-query result plus a locally
 * computed emptiness flag.
 *
 * `isEmpty` should reflect the rows the caller is about to render (after any
 * client-side search/filter). Because {@link resolveListState} only returns
 * "empty" once the query has settled, a filtered-to-zero result during the
 * initial fetch renders as "loading", never as a false empty.
 */
export function useListState(query: ListQueryStatus, isEmpty: boolean): UseListStateResult {
  return useMemo(() => {
    const state = resolveListState(query, isEmpty);
    return {
      state,
      isLoading: state === "loading",
      isError: state === "error",
      isEmpty: state === "empty",
      isData: state === "data",
    };
  }, [query.isPending, query.isError, query.isFetching, isEmpty]);
}
