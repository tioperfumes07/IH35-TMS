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
 * ACCT-F11103 part 2 (migration 202616410100) — QuickBooks rule: only NON-VOIDED payments (and non-voided credit memos)
 * relieve an invoice. A payment-less application relieves it only while its source journal entry
 * (payment_applications.source_journal_entry_id — the JE whose Cr ar_control is the relief) is live
 * (accounting.journal_entry_live_as_of): no source, or a voided / reversed source, relieves nothing.
 *
 * Row-level readers (statement lines, activity, cash-basis settlements) cannot call a SUM function; they LEFT JOIN payments
 * and use the same predicates through the helpers below.
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

/**
 * SQL boolean: the application row relieves the invoice as of the SQL date `asOfSql` — not unapplied by then; a payment-backed
 * row's payment exists and is not voided by then; a payment-less row's source journal entry is live by then.
 */
export function applicationRelievesAsOfSql(pa: string, p: string, asOfSql: string): string {
  return `((${pa}.unapplied_at IS NULL OR (${pa}.unapplied_at AT TIME ZONE 'UTC')::date > ${asOfSql})
    AND CASE WHEN ${pa}.payment_id IS NOT NULL
             THEN ${p}.id IS NOT NULL AND (${p}.voided_at IS NULL OR (${p}.voided_at AT TIME ZONE 'UTC')::date > ${asOfSql})
             ELSE ${pa}.source_journal_entry_id IS NOT NULL
                  AND accounting.journal_entry_live_as_of(${pa}.source_journal_entry_id, ${asOfSql})
        END)`;
}

/** SQL boolean: the application row relieves the invoice today (applicationRelievesAsOfSql as of 'infinity'). */
export function applicationLiveSql(pa: string, p: string): string {
  return applicationRelievesAsOfSql(pa, p, `'infinity'::date`);
}
