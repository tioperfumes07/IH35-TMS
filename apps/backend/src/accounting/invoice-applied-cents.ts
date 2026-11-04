/**
 * ACCT-F11103 — the ONE applied-amount rule every A/R reader uses for an invoice.
 *
 * ACCT-F11070 (#28623) records poster relief (Faro collected the cash — there is no TMS customer-payment document) as an
 * accounting.payment_applications row with payment_id NULL. Readers that summed applications through an INNER JOIN to
 * accounting.payments dropped that relief: a $50,000.00 invoice with a $20,000.00 relief application aged at $50,000.00.
 *
 * accounting.invoice_applied_cents_as_of(invoice_id, as_of) (migration 202616400100) is the rule, shared with
 * accounting.ar_aging_as_of() and accounting.recompute_invoice_paid() ('infinity'):
 *   - payment-backed applications dated by payments.payment_date, payment-less ones by the application's applied_at (UTC);
 *   - an application unapplied on/before the date, or whose payment was voided on/before the date, applies nothing.
 *
 * Row-level readers (statement lines, activity, cash-basis settlements) cannot call a SUM function; they LEFT JOIN payments
 * and use the same three predicates through the helpers below.
 */

/** SQL bigint: cents applied to the invoice aliased `alias` as of the SQL date expression `asOfSql` (e.g. `$2::date`). */
export function invoiceAppliedCentsAsOfSql(alias: string, asOfSql: string): string {
  return `accounting.invoice_applied_cents_as_of(${alias}.id, ${asOfSql})`;
}

/** SQL bigint: cents applied to the invoice aliased `alias` by every live application, whatever its date. */
export function invoiceAppliedCentsLiveSql(alias: string): string {
  return invoiceAppliedCentsAsOfSql(alias, `'infinity'::date`);
}

/**
 * SQL date of one application row: the payment's date when it has a payment, the application's own date when it has none.
 * `pa` = accounting.payment_applications alias, `p` = accounting.payments alias reached through a LEFT JOIN.
 */
export function applicationDateSql(pa: string, p: string): string {
  return `COALESCE(${p}.payment_date, (${pa}.applied_at AT TIME ZONE 'UTC')::date)`;
}

/** SQL boolean: the application row is live today (not unapplied; its payment, if it has one, not voided). */
export function applicationLiveSql(pa: string, p: string): string {
  return `(${pa}.unapplied_at IS NULL AND ${p}.voided_at IS NULL)`;
}
