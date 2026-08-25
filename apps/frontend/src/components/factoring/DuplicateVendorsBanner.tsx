import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { scanDuplicateVendors } from "../../api/factoring";
import { FACTORING_TAB_PATH } from "../../router/route-manifest";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";

const DISMISS_STORAGE_PREFIX = "ih35.factoring.duplicate-vendors-banner.dismissed.";

type DuplicateVendorsBannerProps = {
  companyId: string;
};

/**
 * fact-fix1 — surfaces GET /api/v1/factoring/scan-duplicate-vendors when pairs exist.
 * Dismissible per company (session); link opens Driver Vendor Merges.
 */
export function DuplicateVendorsBanner({ companyId }: DuplicateVendorsBannerProps) {
  const storageKey = `${DISMISS_STORAGE_PREFIX}${companyId}`;
  const [dismissed, setDismissed] = useState(() => {
    if (!companyId || typeof sessionStorage === "undefined") return false;
    try {
      return sessionStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!companyId) {
      setDismissed(false);
      return;
    }
    try {
      setDismissed(sessionStorage.getItem(storageKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [companyId, storageKey]);

  const scanQuery = useQuery({
    queryKey: ["factoring", "scan-duplicate-vendors", companyId],
    queryFn: () => scanDuplicateVendors(companyId),
    enabled: Boolean(companyId) && !dismissed,
    staleTime: 60_000,
  });

  const isSelfPair = (p: { from_vendor_id: string; from_vendor_name: string; to_vendor_id: string; to_vendor_name: string }) =>
    p.from_vendor_id === p.to_vendor_id ||
    p.from_vendor_name.trim().toLowerCase() === p.to_vendor_name.trim().toLowerCase();

  const topPairs = useMemo(
    () =>
      (scanQuery.data?.pairs ?? [])
        .filter((p) => !isSelfPair(p))
        .slice(0, 3),
    [scanQuery.data?.pairs]
  );

  const visiblePairCount = useMemo(
    () => (scanQuery.data?.pairs ?? []).filter((p) => !isSelfPair(p)).length,
    [scanQuery.data?.pairs]
  );

  if (dismissed || !companyId) {
    return null;
  }

  if (scanQuery.isLoading) {
    return null;
  }

  if (scanQuery.isError) {
    return (
      <div className="rounded-sm border border-slate-200 bg-white p-3" data-duplicate-vendors-read-error>
        <ListErrorState
          status={0}
          message="Could not check for duplicate factoring vendors."
          onRetry={() => void scanQuery.refetch()}
        />
      </div>
    );
  }

  if (visiblePairCount === 0) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      /* ignore quota / private mode */
    }
  };

  return (
    <div
      className="flex items-start justify-between gap-3 rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700"
      role="status"
      data-testid="factoring-duplicate-vendors-banner"
    >
      <div className="min-w-0 space-y-1">
        <div className="font-medium">
          Duplicate factoring vendors detected ({visiblePairCount} pair{visiblePairCount === 1 ? "" : "s"})
        </div>
        <p className="text-xs text-slate-600">
          Similar vendor names may fragment reserve / merge history. Review and merge from Driver Vendor
          Merges.
        </p>
        {topPairs.length > 0 ? (
          <ul className="list-inside list-disc text-xs text-slate-600">
            {topPairs.map((p) => (
              <li key={`${p.from_vendor_id}-${p.to_vendor_id}`}>
                <EntityLink kind="vendor" id={p.from_vendor_id} label={p.from_vendor_name} /> ↔{" "}
                <EntityLink kind="vendor" id={p.to_vendor_id} label={p.to_vendor_name} /> (
                {Math.round(Number(p.similarity) * 100)}% similar)
              </li>
            ))}
          </ul>
        ) : null}
        <NavLink
          to={FACTORING_TAB_PATH.vendor_merges}
          className="inline-block text-xs font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900"
          data-testid="factoring-duplicate-vendors-banner-merge-link"
        >
          Open Driver Vendor Merges
        </NavLink>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-sm px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
        onClick={dismiss}
        aria-label="Dismiss duplicate vendors banner"
        data-testid="factoring-duplicate-vendors-banner-dismiss"
      >
        Dismiss
      </button>
    </div>
  );
}
