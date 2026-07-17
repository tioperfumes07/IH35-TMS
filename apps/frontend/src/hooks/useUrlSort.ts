import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * useUrlSort — BANK-SORT-ROLLOUT-ACCT shared URL-persisted sort controller.
 *
 * Reads/writes `?sort=<key>&dir=<asc|desc>` (default param names, overridable) so a list's active
 * column sort survives a page reload and is shareable via a plain link — same asc/desc-only header
 * contract the Banking register's sort/group work established (BANK-SORT-ROLLOUT). Pairs with
 * ParityTable's OPTIONAL controlled-sort props (`sortKey` / `sortDirection` / `onSortChange`):
 * ParityTable itself is NOT coupled to react-router (it has ~130 call sites, several rendered
 * outside a Router in unit tests) — pages opt in individually by spreading this hook's return
 * value onto ParityTable.
 */
export type UrlSortDirection = "asc" | "desc";

export type UrlSortParamNames = {
  key: string;
  dir: string;
};

const DEFAULT_PARAM_NAMES: UrlSortParamNames = { key: "sort", dir: "dir" };

export function useUrlSort(paramNames: UrlSortParamNames = DEFAULT_PARAM_NAMES) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { key: keyParam, dir: dirParam } = paramNames;

  const sortKey = searchParams.get(keyParam) ?? "";
  const sortDirection: UrlSortDirection = searchParams.get(dirParam) === "desc" ? "desc" : "asc";

  const onSortChange = useCallback(
    (nextKey: string, nextDirection: UrlSortDirection) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (nextKey) next.set(keyParam, nextKey);
          else next.delete(keyParam);
          if (nextDirection === "desc") next.set(dirParam, "desc");
          else next.delete(dirParam);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, keyParam, dirParam],
  );

  // BANK-SORT-ROLLOUT-OPS — convenience 3-state click-cycle (asc \u2192 desc \u2192 unsorted) for pages that
  // render their own <th> markup via TableHeaderCell (dispatch board, settlements list) instead of
  // ParityTable. ParityTable manages its own internal 2-state toggle (asc/desc, never fully unsorted)
  // and never calls this — purely additive, no behavior change for existing ACCT call sites.
  const toggleSort = useCallback(
    (key: string) => {
      if (sortKey !== key) {
        onSortChange(key, "asc");
        return;
      }
      if (sortDirection === "asc") {
        onSortChange(key, "desc");
        return;
      }
      onSortChange("", "asc");
    },
    [sortKey, sortDirection, onSortChange],
  );

  return useMemo(
    () => ({ sortKey, sortDirection, onSortChange, toggleSort }),
    [sortKey, sortDirection, onSortChange, toggleSort],
  );
}
