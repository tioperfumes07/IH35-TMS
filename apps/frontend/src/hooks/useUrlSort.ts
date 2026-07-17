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

  return useMemo(
    () => ({ sortKey, sortDirection, onSortChange }),
    [sortKey, sortDirection, onSortChange],
  );
}
