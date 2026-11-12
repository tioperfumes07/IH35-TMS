import { useCallback, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { currentOriginHref, resolveBackHref, withReturnContext } from "../lib/returnContext";

/** ROUND 8.17 — Back restores `ret` origin (tab/filters/period/cohort) or structural parent. */
export function useReturnBack(fallback?: string) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const backHref = useMemo(
    () => resolveBackHref({ searchParams: params, pathname, fallback }),
    [params, pathname, fallback],
  );
  const goBack = useCallback(() => {
    navigate(backHref);
  }, [navigate, backHref]);
  return { backHref, goBack };
}

/** Current board URL (pathname + search) for attaching as return context on forward links. */
export function useOriginHref(): string {
  const { pathname, search } = useLocation();
  return useMemo(() => currentOriginHref(pathname, search), [pathname, search]);
}

/** Build a forward href that carries the current board as `ret`. */
export function useHrefWithReturn(): (targetHref: string) => string {
  const origin = useOriginHref();
  return useCallback((targetHref: string) => withReturnContext(targetHref, origin), [origin]);
}
