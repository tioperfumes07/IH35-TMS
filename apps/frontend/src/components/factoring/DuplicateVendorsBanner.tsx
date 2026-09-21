import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { flagVendorDuplicate, mergeVendor, scanDuplicateVendors } from "../../api/factoring";
import { FACTORING_TAB_PATH } from "../../router/route-manifest";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";
import { colors } from "../../design/tokens";

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
  const queryClient = useQueryClient();
  // FIX-DVB135: which pair's "keep A / keep B" confirm row is expanded — one at a time, keyed by
  // `${from_vendor_id}-${to_vendor_id}`.
  const [confirmingPairKey, setConfirmingPairKey] = useState<string | null>(null);
  const mergeMutation = useMutation({
    mutationFn: async (input: { survivorVendorId: string; duplicateVendorId: string; survivorName: string }) => {
      const reason = `Duplicate factoring vendor merge — "${input.survivorName}" kept, confirmed via Factoring duplicate-vendor scan`;
      await flagVendorDuplicate({
        duplicateVendorId: input.duplicateVendorId,
        survivorVendorId: input.survivorVendorId,
        reason,
        companyId,
      });
      return mergeVendor({ duplicateVendorId: input.duplicateVendorId, survivorVendorId: input.survivorVendorId, reason, companyId });
    },
    onSuccess: () => {
      setConfirmingPairKey(null);
      void queryClient.invalidateQueries({ queryKey: ["factoring", "scan-duplicate-vendors", companyId] });
    },
  });
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

  // ROUND 21.0 item 5c (owner ruling: "a real and valuable finding rendered in flat gray with no
  // severity color... give it the warn treatment and keep it") — the same colors.warn token
  // StatusBadge already uses, not a new palette. This is a genuine data-integrity warning
  // (25 pairs live), not decoration.
  return (
    <div
      className="flex items-start justify-between gap-3 rounded-sm border px-3 py-2 text-xs"
      style={{ borderColor: colors.warn.strong, backgroundColor: colors.warn.soft, color: colors.warn.strong }}
      role="status"
      data-testid="factoring-duplicate-vendors-banner"
    >
      <div className="min-w-0 space-y-1">
        <div className="font-semibold">
          Duplicate factoring vendors detected ({visiblePairCount} pair{visiblePairCount === 1 ? "" : "s"})
        </div>
        <p className="text-xs" style={{ color: colors.warn.strong }}>
          Similar vendor names may fragment reserve / merge history. Review and merge from Driver Vendor
          Merges.
        </p>
        {topPairs.length > 0 ? (
          <ul className="list-inside list-disc text-xs" style={{ color: colors.warn.strong }}>
            {topPairs.map((p) => {
              // FIX-DVB135 (Round 27.1 step 5.7, was VENDOR-MERGE-QBO-ID-MISMATCH): the old
              // predicate gated "Merge these" on BOTH sides carrying a synced qbo_vendor_id — 0 of
              // 618 USMCA vendors have one (USMCA never pushes to/from QBO), so the button could
              // never render here. from_vendor_id/to_vendor_id are this TMS's own vendor ids,
              // always present, and merge directly through the generic vendor-merge primitive
              // (flag-duplicate + merge, POST /api/v1/vendors/:id/...) — no QBO involved. Which
              // side survives is a real, hard-to-reverse decision (repoints bills/expenses/etc
              // onto the survivor and deactivates the other), so it is a deliberate two-click
              // confirm naming the exact survivor, never an automatic pick.
              const pairKey = `${p.from_vendor_id}-${p.to_vendor_id}`;
              const isConfirming = confirmingPairKey === pairKey;
              const mutationTargetsThisPair = Boolean(
                mergeMutation.variables &&
                  [p.from_vendor_id, p.to_vendor_id].includes(mergeMutation.variables.duplicateVendorId)
              );
              const isMergingThisPair = mergeMutation.isPending && mutationTargetsThisPair;
              const mergeErrorForThisPair = mergeMutation.isError && mutationTargetsThisPair;
              return (
                <li key={pairKey}>
                  <EntityLink kind="vendor" id={p.from_vendor_id} label={p.from_vendor_name} /> ↔{" "}
                  <EntityLink kind="vendor" id={p.to_vendor_id} label={p.to_vendor_name} /> (
                  {Math.round(Number(p.similarity) * 100)}% similar) —{" "}
                  {isConfirming ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span>Keep:</span>
                      <button
                        type="button"
                        className="font-semibold underline underline-offset-2 disabled:opacity-60"
                        style={{ color: colors.warn.strong }}
                        disabled={isMergingThisPair}
                        onClick={() =>
                          mergeMutation.mutate({
                            survivorVendorId: p.from_vendor_id,
                            duplicateVendorId: p.to_vendor_id,
                            survivorName: p.from_vendor_name,
                          })
                        }
                        data-testid="factoring-duplicate-vendors-banner-merge-keep-from"
                      >
                        {p.from_vendor_name}
                      </button>
                      <button
                        type="button"
                        className="font-semibold underline underline-offset-2 disabled:opacity-60"
                        style={{ color: colors.warn.strong }}
                        disabled={isMergingThisPair}
                        onClick={() =>
                          mergeMutation.mutate({
                            survivorVendorId: p.to_vendor_id,
                            duplicateVendorId: p.from_vendor_id,
                            survivorName: p.to_vendor_name,
                          })
                        }
                        data-testid="factoring-duplicate-vendors-banner-merge-keep-to"
                      >
                        {p.to_vendor_name}
                      </button>
                      <button
                        type="button"
                        className="underline underline-offset-2"
                        style={{ color: colors.warn.strong }}
                        onClick={() => setConfirmingPairKey(null)}
                        data-testid="factoring-duplicate-vendors-banner-merge-cancel"
                      >
                        cancel
                      </button>
                      {isMergingThisPair ? <span>merging…</span> : null}
                      {mergeErrorForThisPair ? (
                        <span data-testid="factoring-duplicate-vendors-banner-merge-error">
                          {(mergeMutation.error as Error)?.message ?? "merge failed"}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="font-semibold underline underline-offset-2"
                      style={{ color: colors.warn.strong }}
                      onClick={() => setConfirmingPairKey(pairKey)}
                      data-testid="factoring-duplicate-vendors-banner-merge-pair-link"
                    >
                      Merge these
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
        <NavLink
          to={FACTORING_TAB_PATH.vendor_merges}
          className="inline-block text-xs font-semibold underline underline-offset-2"
          style={{ color: colors.warn.strong }}
          data-testid="factoring-duplicate-vendors-banner-merge-link"
        >
          Open Driver Vendor Merges
        </NavLink>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-sm px-2 py-0.5 text-xs font-medium"
        style={{ color: colors.warn.strong }}
        onClick={dismiss}
        aria-label="Dismiss duplicate vendors banner"
        data-testid="factoring-duplicate-vendors-banner-dismiss"
      >
        Dismiss
      </button>
    </div>
  );
}
