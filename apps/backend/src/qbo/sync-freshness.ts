export const QBO_SYNC_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export const QBO_SYNC_STALE_AFTER_SECONDS = QBO_SYNC_STALE_AFTER_MS / 1000;

export type QboSyncSuccessSource = "qbo_sync_runs" | "master_data_cdc";

export type QboSyncSuccessCandidate = {
  source: QboSyncSuccessSource;
  completedAt: string | null | undefined;
};

export type QboSyncFreshness = {
  last_success_at: string | null;
  last_success_source: QboSyncSuccessSource | null;
  last_success_age_seconds: number | null;
  stale_after_seconds: number;
  freshness_status: "fresh" | "stale" | "never";
  is_stale: boolean;
};

export function computeQboSyncFreshness(
  candidates: QboSyncSuccessCandidate[],
  nowMs = Date.now()
): QboSyncFreshness {
  const successful = candidates
    .map((candidate) => ({
      ...candidate,
      completedMs: candidate.completedAt ? Date.parse(candidate.completedAt) : NaN,
    }))
    .filter((candidate) => Number.isFinite(candidate.completedMs))
    .sort((a, b) => b.completedMs - a.completedMs);

  const latest = successful[0];
  if (!latest) {
    return {
      last_success_at: null,
      last_success_source: null,
      last_success_age_seconds: null,
      stale_after_seconds: QBO_SYNC_STALE_AFTER_SECONDS,
      freshness_status: "never",
      is_stale: false,
    };
  }

  // PostgreSQL timestamptz values are absolute instants. Comparing epoch milliseconds keeps this
  // independent of the browser, server, company, or daylight-saving timezone. A small future clock
  // skew must not produce a negative age or make stale data appear newer than "now".
  const ageMs = Math.max(0, nowMs - latest.completedMs);
  const isStale = ageMs > QBO_SYNC_STALE_AFTER_MS;
  return {
    last_success_at: latest.completedAt ?? null,
    last_success_source: latest.source,
    last_success_age_seconds: Math.floor(ageMs / 1000),
    stale_after_seconds: QBO_SYNC_STALE_AFTER_SECONDS,
    freshness_status: isStale ? "stale" : "fresh",
    is_stale: isStale,
  };
}
