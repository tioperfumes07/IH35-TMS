// PROJECTED-CASH-FOLLOWS-ETA (Phase 7, BLOCK 2) — receivable lag rule.
//
// projected_cash_date = effective_delivery_date. The lag is ZERO.
//
// Rule (owner-stated 2026-09-28, verbatim): "THE PROJECTIONS ARE ON THE PROJECTED PURCHASES OF
// INVOICES BY FARO. THE DELIVERY DATE OF THE LOAD IS THE PROJECTED INCOME DATE." and
// "I AM TELLING YOU HOW CASH FLOW WORKS, THAT IS THE CODE."
//
// This SUPERSEDES the 2026-06-17 rule this file previously carried, which asserted the lag is
// never zero and added ~T+1 for factored loads and net terms otherwise. That rule shifted every
// delivery one day forward: with 1,236 of 1,248 USMCA customers factoring_eligible, the 9 loads
// delivering 2026-09-28 ($40,575.00) bucketed onto 2026-09-29 and the owner's cash-flow screen
// showed nothing for today. Measured live 2026-09-28 under bypass_rls='lucia'.
//
// The delivery date is the one entered in the Load Wizard. If dispatch changes it because a truck
// runs late, the projection follows automatically — the bucket is read from the delivery stop at
// query time and is never stored.
//
// This module is the pure RULE only — no DB, no posting, no accounting/AR/QBO.

// The factor buys the invoice at delivery. Cash is projected on the delivery date itself.
export const FACTORING_ADVANCE_DAYS = 0;

// Non-factored customers also project on the delivery date, per the owner ruling above. Retained as
// an exported constant because catalogs.payment_terms still drives A/R aging and the A/P side, which
// are separate from this forecast.
export const DEFAULT_NET_TERMS_DAYS = 0;

/**
 * Receivable lag in days for a load's projected cash date.
 * Always 0 — the delivery date IS the projected income date (owner ruling 2026-09-28).
 */
export function receivableLagDays(_input: { is_factored: boolean; customer_net_days: number | null | undefined }): number {
  return 0;
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
