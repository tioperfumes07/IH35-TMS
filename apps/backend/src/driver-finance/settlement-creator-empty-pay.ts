/**
 * ROUND 326 queue item 7 (G-10) — DEADHEAD PAY. The Settlement Creator paid empty miles only when the operator
 * typed a separate empty rate: no rate (or a 0) made real empty miles $0.00 while the signed PDF prints Empty
 * Miles dollars. Owner MILES SPEC (2026-09-02): the empty rate is its own value when set, otherwise it equals the
 * driver's loaded per-mile rate (the signed documents print one Driver RPM for both legs) — never a stored
 * duplicate, never a hardcoded figure. A load with no per-mile rate at all (flat line-haul amount) has no rate
 * to borrow: empty pay stays unpriced (null) rather than invented.
 */
type EmptyPayLoad = {
  empty_miles?: number | null;
  empty_rate_cents?: number | null;
  line_haul_rate_cents?: number | null;
};

/** The per-mile rate empty miles are paid at, or null when the load carries no per-mile rate at all. */
export function creatorEmptyRateCents(load: EmptyPayLoad): number | null {
  const own = Number(load.empty_rate_cents ?? 0);
  if (Number.isFinite(own) && own > 0) return own;
  const loaded = Number(load.line_haul_rate_cents ?? 0);
  return Number.isFinite(loaded) && loaded > 0 ? loaded : null;
}

/** Empty-mile pay in cents: miles × the resolved empty rate; 0 when there are no empty miles or no rate. */
export function creatorEmptyPayCents(load: EmptyPayLoad): number {
  const miles = Number(load.empty_miles ?? 0);
  const rate = creatorEmptyRateCents(load);
  return Number.isFinite(miles) && miles > 0 && rate != null ? Math.round(miles * rate) : 0;
}
