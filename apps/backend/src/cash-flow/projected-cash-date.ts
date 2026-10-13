// PROJECTED-CASH-FOLLOWS-ETA (Phase 7, BLOCK 2, Phase 2b-ii) — SQL for the day a load's cash is
// expected to land in the FORECAST.
//
//   projected_cash_date = effective_delivery_date + receivable_lag
//   effective_delivery_date = COALESCE(loads.predicted_delivery_date, <delivery stop scheduled>)
//   receivable_lag (days)   = factored customer → 0 (ROUND 195.1, owner law 2026-09-28: Faro buys
//                             at delivery, no lag); else customer net terms
//                             (catalogs.payment_terms.days_until_due), NET-30 fallback, never 0.
//
// FORECAST/SCHEDULING ONLY — this shifts a prediction bucket, never a posted invoice/AR/QBO entry.
// Gated behind CASH_FOLLOWS_ETA_ENABLED at the call site: when OFF, consumers keep bucketing by the
// raw scheduled delivery date (current behaviour); when ON, they bucket by projected_cash_date.
//
// LEAD 443.140 #8(b) — every cash date the projection service puts on a source is computed here
// (see scripts/verify-cash-flow-projection-dates.mjs). Do not re-derive lag / delivery / terms
// math in cash-flow.service.ts.

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

/**
 * Flag-OFF bucket: the raw delivery appointment day (no receivable lag).
 * Call sites that used to write `expr::date` inline must interpolate this instead.
 */
export function rawDeliveryDateSql(deliveryScheduledExpr: string): string {
  return `(${deliveryScheduledExpr})::date`;
}

/**
 * Late-load invoice effective due: current delivery appointment + customer net terms
 * (0-day fallback when terms are unset — preserves the pre-8b invoice CASE). Factored
 * short-circuit is NOT applied here; for that path use projectedCashDateSql.
 */
export function lateLoadInvoiceDueDateSql(opts: {
  deliveryScheduledExpr: string;
  paymentTermsAlias?: string;
}): string {
  const pt = opts.paymentTermsAlias ?? "pt";
  return `((${opts.deliveryScheduledExpr})::date + COALESCE(NULLIF(${pt}.days_until_due, 0), 0) * INTERVAL '1 day')::date`;
}

/**
 * Expense / card-payable cash date: transaction (purchase) day + payment terms.
 * Lead 443.140 #8(b) reading (d): the only card-payment-date the schema carries today.
 */
export function expensePaymentDueDateSql(opts: {
  transactionDateExpr: string;
  paymentTermsAlias?: string;
}): string {
  const pt = opts.paymentTermsAlias ?? "pt";
  return `((${opts.transactionDateExpr})::date + COALESCE(NULLIF(${pt}.days_until_due, 0), 0) * INTERVAL '1 day')::date`;
}

/**
 * Driver-bill cash due. When due-date columns exist (migration 202615830700), use the
 * shared effective_due_date function; otherwise fall back to created day.
 */
export function driverBillCashDueDateSql(opts: {
  hasDueColumns: boolean;
  todayParam?: string;
}): string {
  if (opts.hasDueColumns) {
    const today = opts.todayParam ?? "$2::date";
    return `COALESCE(driver_finance.driver_bill_effective_due_date(db.due_date, db.due_date_basis, ${today}), db.created_at::date)`;
  }
  return `(db.created_at)::date`;
}

/**
 * Factoring advance / reserve cash date — the funding (or collection) day itself.
 * Faro lag is 0 (ROUND 195.1); the stamp is already the forecast day.
 */
export function factoringCashDateSql(timestampExpr: string): string {
  return `(${timestampExpr})::date`;
}

/**
 * Relay wallet top-up cash date — the deposit's created day.
 */
export function relayTopupCashDateSql(createdAtExpr: string): string {
  return `(${createdAtExpr})::date`;
}

/**
 * TS helper: add payment-term calendar days to an ISO date (YYYY-MM-DD).
 * Replaces inline setUTCDate + termsDays in the projection service.
 */
export function addPaymentTermsDays(isoDate: string, termsDays: number): string {
  const due = new Date(`${isoDate}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + termsDays);
  return due.toISOString().slice(0, 10);
}
