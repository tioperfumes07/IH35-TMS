import { useEffect, useState } from "react";
import {
  getCachedFeatureFlag,
  refreshFeatureFlag,
  startFeatureFlagRefresh,
  subscribeFeatureFlag,
} from "../lib/feature-flags-client";

export function useFeatureFlag(flagKey: string, operatingCompanyId?: string | null) {
  const [enabled, setEnabled] = useState<boolean>(() => getCachedFeatureFlag(flagKey, operatingCompanyId) ?? false);
  const [loading, setLoading] = useState(() => getCachedFeatureFlag(flagKey, operatingCompanyId) == null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startFeatureFlagRefresh();
    let cancelled = false;

    void refreshFeatureFlag(flagKey, operatingCompanyId)
      .then((value) => {
        if (!cancelled) {
          setEnabled(value);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(String((err as Error)?.message ?? err));
          setLoading(false);
        }
      });

    const unsubscribe = subscribeFeatureFlag((changedKey, value) => {
      if (changedKey === flagKey) setEnabled(value);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [flagKey, operatingCompanyId]);

  return { enabled, loading, error };
}
