/**
 * ACCT-F11099 (owner 2026-11-04) — the factoring identity A/R readers use, separate from the payment status.
 *
 * A customer payment moves a factored invoice to partial / paid like QuickBooks (accounting.recompute_invoice_paid(),
 * migration 202616380100). So `status = 'factored'` alone can no longer say "this receivable moved off trade A/R through
 * factoring recourse" — a recoursed invoice that later collects reads 'partial' / 'paid'. Every A/R reader that excludes
 * 'factored' also excludes accounting.invoice_recoursed_off_trade_ar(<invoice>.id): status 'factored', or factoring_status
 * 'recourse_returned' with a live factoring_chargeback posting on its advance.
 *
 * NOT the identity: factoring_status <> 'not_factored'. A funded invoice ('advanced') stays on trade A/R as pledged
 * collateral (secured borrowing) — prod USMCA 2026-11-04: 57 such invoices, $175,650.00.
 */

/** SQL boolean: the invoice aliased `alias` is recoursed off trade A/R. */
export function invoiceRecoursedOffTradeArSql(alias: string): string {
  return `accounting.invoice_recoursed_off_trade_ar(${alias}.id)`;
}

/** SQL predicate for an A/R reader's WHERE / JOIN: the invoice aliased `alias` is still on trade A/R. */
export function invoiceOnTradeArSql(alias: string): string {
  return `NOT ${invoiceRecoursedOffTradeArSql(alias)}`;
}
