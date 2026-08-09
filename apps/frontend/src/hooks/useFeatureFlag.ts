import { useEffect, useState } from "react";
import {
  getCachedFeatureFlag,
  refreshFeatureFlag,
  startFeatureFlagRefresh,
  subscribeFeatureFlag,
} from "../lib/feature-flags-client";
import { userFacingApiError } from "../lib/api-error-message";

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
          setError(userFacingApiError(err, "Failed to load feature flag"));
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
