import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDebtSummary, type DebtSummary } from "../../../api/driverFinance";

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
        error: String((error as Error)?.message || error),
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
        return stale !== current.isStale ? { ...current, isStale: stale } : current;
      });
    }, 5000);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, []);

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
