/**
 * ROUND 326 queue item 7 (G-10) — DEADHEAD PAY. The Settlement Creator paid empty miles only when the operator
 * typed a separate empty rate: no rate (or a 0) made real empty miles $0.00 while the signed PDF prints Empty
 * Miles dollars. Owner MILES SPEC (2026-09-02): the empty rate is its own value when set, otherwise it equals the
 * driver's loaded per-mile rate (the signed documents print one Driver RPM for both legs) — never a stored
 * duplicate, never a hardcoded figure. A load with no per-mile rate at all (flat line-haul amount) has no rate
 * to borrow: empty pay stays unpriced (null) rather than invented.
 */
import { deadheadPayCents, deadheadRateCents, milesTimesRateCents } from "./deadhead-rule.js";

type EmptyPayLoad = {
  empty_miles?: number | null;
  empty_rate_cents?: number | null;
  line_haul_rate_cents?: number | null;
};

/** The per-mile rate empty miles are paid at, or null when the load carries no per-mile rate at all. */
export function creatorEmptyRateCents(load: EmptyPayLoad): number | null {
  // ROUND 288.3 item 2: the one deadhead rule (deadhead-rule.ts), shared with the driver bill and batch pay.
  return deadheadRateCents({ emptyRateCents: load.empty_rate_cents, loadedRateCents: load.line_haul_rate_cents });
}

/** Empty-mile pay in cents: miles × the resolved empty rate; 0 when there are no empty miles or no rate. */
export function creatorEmptyPayCents(load: EmptyPayLoad): number {
  return deadheadPayCents(load.empty_miles, creatorEmptyRateCents(load));
}

/**
 * ROUND 443.4 — DRIVER PAY NEVER READS CUSTOMER REVENUE. Driver pay miles are the short miles (company practical
 * miles stay on loaded_miles); the loaded line is pay rate x short miles. line_haul_amount_cents (the customer's
 * "Invoice Amt") and customer accessorials feed the invoice only — a $0 Transportation invoice must not zero the
 * driver's pay. One function for the preview and the post, so the totals the owner checks are the ones written.
 */
type LoadedPayLoad = { miles_shortest?: number | null; loaded_miles?: number | null; line_haul_rate_cents?: number | null };

export function creatorPayMiles(load: LoadedPayLoad): number | null {
  const miles = Number(load.miles_shortest ?? load.loaded_miles ?? NaN);
  return Number.isFinite(miles) && miles > 0 ? miles : null;
}

/** Loaded-miles pay in cents (pay rate x short miles), or null when the load carries no miles or no pay rate. */
export function creatorLoadedPayCents(load: LoadedPayLoad): number | null {
  const miles = creatorPayMiles(load);
  const rate = Number(load.line_haul_rate_cents ?? NaN);
  if (miles == null || !Number.isFinite(rate) || rate <= 0) return null;
  return milesTimesRateCents(miles, rate);
}
