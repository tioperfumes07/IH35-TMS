/**
 * Row 129 / ENG-50 (11-03, ACCT-F11070) — accounting.invoices.amount_paid_cents is DERIVED from its applications, with ONE writer.
 *
 * The one writer is the database trigger accounting.recompute_invoice_paid() on accounting.payment_applications (sum of the live —
 * unapplied_at IS NULL — applications; status sent / partial / paid; 'factored' and 'void' kept). Code never SETs the column.
 *
 * ROOT CAUSE: two posters wrote the column directly, beside the trigger —
 *   - factoring-posting/poster.service.ts applyCustomerPaymentSubledgerRelief: `SET amount_paid_cents = <allocated>`;
 *   - factoring/faro-reserve-entries.service.ts (Faro short-pay "customer paid Faro"): `SET amount_paid_cents = amount_paid_cents + n`.
 * Neither wrote an application, so the header said "paid" with no application behind it (the register's 9-13515 $525 / 7 $350
 * mismatches), and the next application on the invoice (or an unapply) recomputed the header from the applications and silently
 * erased that relief. Live today (prod, 11-03): 193 invoices, 0 header ≠ applications, 0 applications at all — the mismatch is gone
 * from the data; this closes the writers that produced it.
 *
 * Relief a poster records (the cash is not a TMS customer-payment document — Faro collected it) is an application with
 * payment_id NULL (the column is nullable; target_kind 'invoice'). The trigger derives the header from it.
 */
type Q = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export class InvoiceReliefError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code);
  }
}

/** Record `amountCents` of relief on an invoice as ONE payment-less application. The trigger moves amount_paid_cents. */
export async function applyInvoiceRelief(
  client: Q,
  input: { operatingCompanyId: string; invoiceId: string; amountCents: number; actorUserId: string | null },
): Promise<{ application_id: string } | null> {
  const cents = Math.round(Number(input.amountCents));
  if (!Number.isFinite(cents) || cents < 0) throw new InvoiceReliefError("invoice_relief_amount_invalid");
  if (cents === 0) return null;
  const inv = (await client.query<{ total: string; paid: string }>(
    `SELECT total_cents::text AS total, COALESCE(amount_paid_cents, 0)::text AS paid FROM accounting.invoices
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL FOR UPDATE`,
    [input.invoiceId, input.operatingCompanyId],
  )).rows[0];
  if (!inv) throw new InvoiceReliefError("invoice_relief_invoice_not_found");
  if (cents > Number(inv.total) - Number(inv.paid)) throw new InvoiceReliefError("invoice_relief_exceeds_open_balance");
  const row = (await client.query<{ id: string }>(
    `INSERT INTO accounting.payment_applications
       (operating_company_id, payment_id, invoice_id, amount_cents, amount_applied, target_kind, target_id, applied_by_user_id)
     VALUES ($1::uuid, NULL, $2::uuid, $3::bigint, ($3::numeric / 100), 'invoice', $2::uuid, $4::uuid)
     RETURNING id::text`,
    [input.operatingCompanyId, input.invoiceId, cents, input.actorUserId],
  )).rows[0];
  return row ? { application_id: row.id } : null;
}

/**
 * Bring an invoice's derived paid amount UP to `targetPaidCents` (a poster that computes the cumulative relief from its own ledger).
 * Never lowers it: a target below the derived paid amount is refused by name (the old direct SET silently lowered it, erasing
 * relief another document had applied).
 */
export async function raiseInvoicePaidTo(
  client: Q,
  input: { operatingCompanyId: string; invoiceId: string; targetPaidCents: number; actorUserId: string | null },
): Promise<{ application_id: string } | null> {
  const cur = (await client.query<{ paid: string }>(
    `SELECT COALESCE(amount_paid_cents, 0)::text AS paid FROM accounting.invoices
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL FOR UPDATE`,
    [input.invoiceId, input.operatingCompanyId],
  )).rows[0];
  if (!cur) throw new InvoiceReliefError("invoice_relief_invoice_not_found");
  const delta = Math.round(Number(input.targetPaidCents)) - Number(cur.paid);
  if (delta < 0) {
    throw new InvoiceReliefError(
      "invoice_relief_would_lower_paid",
      `invoice_relief_would_lower_paid: invoice ${input.invoiceId}: derived paid ${cur.paid} is above the poster's cumulative ${input.targetPaidCents} — unapply the application that over-relieved it`,
    );
  }
  return applyInvoiceRelief(client, { operatingCompanyId: input.operatingCompanyId, invoiceId: input.invoiceId, amountCents: delta, actorUserId: input.actorUserId });
}
