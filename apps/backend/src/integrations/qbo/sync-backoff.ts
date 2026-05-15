const BASE_MS = 5_000;
const MAX_MS = 60 * 60 * 1000;

/** Next delay before retrying an outbound QBO sync job. `attempt` is the post-lock attempt count on the row. */
export function computeOutboundBackoffMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  const exp = Math.min(n, 12);
  const raw = BASE_MS * 2 ** Math.max(0, exp - 1);
  return Math.min(raw, MAX_MS);
}
