/** Bounded exponential backoff bases (ms), matching historic OutboxProcessor schedule. */
export const OUTBOX_RETRY_BACKOFF_MS = [30_000, 120_000, 600_000, 3_600_000, 21_600_000, 86_400_000] as const;

export const OUTBOX_MAX_RETRIES = 6;

/**
 * Equal jitter: delay ∈ [base/2, base]. Keeps lower bound predictable while avoiding thundering herds.
 */
export function computeOutboxRetryDelayMs(
  retryCountAfterFailure: number,
  random: () => number = Math.random
): number {
  const idx = Math.min(Math.max(retryCountAfterFailure - 1, 0), OUTBOX_RETRY_BACKOFF_MS.length - 1);
  const base = OUTBOX_RETRY_BACKOFF_MS[idx] ?? OUTBOX_RETRY_BACKOFF_MS[OUTBOX_RETRY_BACKOFF_MS.length - 1];
  const half = Math.floor(base / 2);
  const unit = Math.min(1, Math.max(0, random()));
  // Inclusive equal-jitter in [half, base]
  const jitter = Math.floor(unit * (base - half + 1));
  return Math.min(base, Math.max(1_000, half + jitter));
}
