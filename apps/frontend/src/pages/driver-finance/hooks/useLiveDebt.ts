import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDebtSummary, type DebtSummary } from "../../../api/driverFinance";
import { userFacingApiError } from "../../../lib/api-error-message";

type State = {
  debt: DebtSummary | null;
  loading: boolean;
  isStale: boolean;
  error: string | null;
};

export function useLiveDebt(driverId: string | null, operatingCompanyId: string | null) {
  const [state, setState] = useState<State>({
    debt: null,
    loading: false,
    isStale: false,
    error: null,
  });
  const timerRef = useRef<number | null>(null);
  // LV-SETTLEMENT-DEBT-REFRESHING-PERMANENT-STALE — the interval below used to only FLIP isStale
  // to true and never actually re-fetch, so the UI stuck on "Refreshing..." forever. This guards
  // against firing an overlapping refresh() while one is already in flight (the 5s interval is
  // itself the retry backoff on failure — no separate timer needed).
  const refreshingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!driverId || !operatingCompanyId) return;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const debt = await getDebtSummary(driverId, operatingCompanyId);
      setState({ debt, loading: false, isStale: false, error: null });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: userFacingApiError(error, "Could not load debt summary"),
      }));
    }
  }, [driverId, operatingCompanyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setState((current) => {
        const computedAtRaw = current.debt?.computed_at;
        if (!computedAtRaw) return current;
        const computedAt = new Date(computedAtRaw).getTime();
        const stale = Date.now() - computedAt > 5000;
        // LV-SETTLEMENT-DEBT-REFRESHING-PERMANENT-STALE — actually trigger the refresh a stale
        // reading implies, instead of only flagging staleness and leaving the UI stuck showing
        // "Refreshing..." with no request ever in flight to resolve it.
        if (stale && !refreshingRef.current) {
          refreshingRef.current = true;
          void refresh().finally(() => {
            refreshingRef.current = false;
          });
        }
        return stale !== current.isStale ? { ...current, isStale: stale } : current;
      });
    }, 5000);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, [refresh]);

  const displayDebt = useMemo(() => {
    if (state.isStale) return "?";
    return (state.debt?.total_active_debt ?? 0).toFixed(2);
  }, [state.debt, state.isStale]);

  return {
    debt: state.debt,
    debtDisplay: displayDebt,
    computedAt: state.debt?.computed_at ?? null,
    isStale: state.isStale,
    loading: state.loading,
    error: state.error,
    refresh,
  };
}
