// PROJECTED-CASH-FOLLOWS-ETA (Phase 7, BLOCK 2, Phase 2b-ii) — SQL for the day a load's cash is
// expected to land in the FORECAST.
//
//   projected_cash_date = effective_delivery_date + receivable_lag
//   effective_delivery_date = COALESCE(loads.predicted_delivery_date, <delivery stop scheduled>)
//   receivable_lag (days)   = factored customer → factoring advance (~T+1); else customer net terms
//                             (catalogs.payment_terms.days_until_due), NET-30 fallback. Never 0.
//
// FORECAST/SCHEDULING ONLY — this shifts a prediction bucket, never a posted invoice/AR/QBO entry.
// Gated behind CASH_FOLLOWS_ETA_ENABLED at the call site: when OFF, consumers keep bucketing by the
// raw scheduled delivery date (current behaviour); when ON, they bucket by projected_cash_date.

import { FACTORING_ADVANCE_DAYS, DEFAULT_NET_TERMS_DAYS } from "../dispatch/receivable-lag.js";

/**
 * SQL `date` expression for projected_cash_date. Requires the query to expose:
 *   - loadAlias.predicted_delivery_date
 *   - deliveryScheduledExpr — SQL evaluating to the delivery stop's scheduled timestamp
 *   - customerAlias.factoring_eligible
 *   - paymentTermsAlias.days_until_due  (LEFT JOIN catalogs.payment_terms ON ... = customer.payment_terms_id)
 *
 * Keeps the factoring/net constants in one place (shared with the TS receivable-lag rule).
 */
export function projectedCashDateSql(opts: {
  loadAlias?: string;
  customerAlias?: string;
  paymentTermsAlias?: string;
  deliveryScheduledExpr: string;
}): string {
  const l = opts.loadAlias ?? "l";
  const c = opts.customerAlias ?? "c";
  const pt = opts.paymentTermsAlias ?? "pt";
  const effective = `COALESCE(${l}.predicted_delivery_date, ${opts.deliveryScheduledExpr})`;
  const lagDays = `CASE WHEN COALESCE(${c}.factoring_eligible, false) THEN ${FACTORING_ADVANCE_DAYS} ELSE COALESCE(NULLIF(${pt}.days_until_due, 0), ${DEFAULT_NET_TERMS_DAYS}) END`;
  return `((${effective})::date + (${lagDays}) * INTERVAL '1 day')::date`;
}
