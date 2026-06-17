// PROJECTED-CASH-FOLLOWS-ETA (Phase 7, BLOCK 2) — receivable lag rule.
//
// projected_cash_date = effective_delivery_date + receivable_lag(load). The lag is NEVER zero —
// anchoring cash to the delivery date alone would be wrong by the whole factoring/net window.
//
// Rule (Jorge-locked 2026-06-17):
//   * factored loads      → factoring advance timing (Block-20 Option A, ~T+1 from invoice)
//   * non-factored loads  → the customer's net terms (mdata.customers.payment_terms_id →
//                           catalogs.payment_terms.days_until_due)
//
// This module is the pure RULE only — no DB, no posting, no accounting/AR/QBO. The SQL that
// resolves is_factored + the customer's net days for a load lands in the forecast consumer
// (Phase 2b) and is shown for review there.

// Block-20 VQ1 Factoring = Option A: the factor advances ~T+1 from invoice.
export const FACTORING_ADVANCE_DAYS = 1;

// Documented fallback when a non-factored customer has NO payment_terms configured. NET-30 is the
// industry-standard default; surfaced so it is never a silent zero. Confirm per-customer terms are
// set so this fallback is rarely hit.
export const DEFAULT_NET_TERMS_DAYS = 30;

/**
 * Receivable lag in days for a load's projected cash date. Never returns 0 (the factoring/net
 * window always applies).
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
