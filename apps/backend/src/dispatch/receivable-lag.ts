// PROJECTED-CASH-FOLLOWS-ETA (Phase 7, BLOCK 2) — receivable lag rule.
//
// projected_cash_date = effective_delivery_date + receivable_lag(load).
//
// Rule (ROUND 195.1, owner law, 2026-09-28 — SUPERSEDES the 2026-06-17 lock below; do not re-raise
// that lock, it is retired): "THE DELIVERY DATE OF THE LOAD IS THE PROJECTED INCOME DATE. Faro buys
// the invoice at delivery. There is no lag." A factored load's lag is now 0 — projected cash date
// equals the raw delivery date, exactly. Non-factored loads are UNCHANGED: the customer's net terms
// still apply and are never zero (a real net-terms customer is genuinely paying later than
// delivery; only the factored-timing assumption was wrong).
//
//   * factored loads      → 0 days (Faro buys at delivery; owner law, 2026-09-28)
//   * non-factored loads  → the customer's net terms (mdata.customers.payment_terms_id →
//                           catalogs.payment_terms.days_until_due), NET-30 fallback, never zero
//
// This module is the pure RULE only — no DB, no posting, no accounting/AR/QBO. The SQL that
// resolves is_factored + the customer's net days for a load lands in the forecast consumer
// (Phase 2b, projected-cash-date.ts) and is shown for review there.

// ROUND 195.1 (owner law, 2026-09-28): Faro buys the invoice AT delivery — no advance-timing lag.
// Was 1 (Block-20 VQ1 Option A, ~T+1 from invoice) under the retired 2026-06-17 lock.
export const FACTORING_ADVANCE_DAYS = 0;

// Documented fallback when a non-factored customer has NO payment_terms configured. NET-30 is the
// industry-standard default; surfaced so it is never a silent zero. Confirm per-customer terms are
// set so this fallback is rarely hit. Unaffected by ROUND 195.1 — applies only to non-factored loads.
export const DEFAULT_NET_TERMS_DAYS = 30;

/**
 * Receivable lag in days for a load's projected cash date. A factored load returns 0 (ROUND 195.1
 * owner law: Faro buys at delivery, no lag). A non-factored load never returns 0 — the customer's
 * real net terms apply, falling back to NET-30 when unconfigured.
 */
export function receivableLagDays(input: { is_factored: boolean; customer_net_days: number | null | undefined }): number {
  if (input.is_factored) return FACTORING_ADVANCE_DAYS;
  const net = input.customer_net_days;
  if (typeof net === "number" && Number.isFinite(net) && net > 0) return net;
  return DEFAULT_NET_TERMS_DAYS;
}

/**
 * Projected cash date = effective delivery date + receivable lag. Pure date math (UTC day add);
 * returns null when there is no effective delivery date to anchor on.
 */
export function projectedCashDate(
  effectiveDeliveryDate: string | null | undefined,
  lagDays: number
): string | null {
  if (!effectiveDeliveryDate) return null;
  const base = new Date(effectiveDeliveryDate);
  if (Number.isNaN(base.getTime())) return null;
  base.setUTCDate(base.getUTCDate() + Math.max(0, Math.floor(lagDays)));
  return base.toISOString();
}
