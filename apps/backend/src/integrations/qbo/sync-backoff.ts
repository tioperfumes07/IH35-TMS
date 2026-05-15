const BASE_MS = 30_000;
const MAX_MS = 60 * 60 * 1000;

/** Exponential retry delay: min(30s × 2^(attempt−1), 1h). `attempt` is queue row attempt_count after lock. */
export function computeOutboundBackoffMs(attempt: number): number {
  const a = Math.max(1, Math.floor(attempt));
  const exp = Math.min(Math.max(0, a - 1), 11);
  const raw = BASE_MS * 2 ** exp;
  return Math.min(raw, MAX_MS);
}
