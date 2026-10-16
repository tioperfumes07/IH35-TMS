/**
 * LEAD 443.171 C — partial purchase (owner 2026-10-16: "we sent an invoice to Faro for 4000 and they only purchased 3000").
 *
 * The invoice stays ONE A/R document at its full total; the factoring liability 2150 (factoring_advance_liability) carries
 * only the PURCHASED gross of each live purchase line. ONE definition of "how much of the purchased gross is still owed to
 * Faro", used by every reader that relieves 2150 or applies cash to a factored invoice:
 *   - the customer-paid-Faro leg (faro-reserve-entries.service.ts): Dr 2150 = min(payment, unrelieved), the excess is money
 *     Faro owes us (Dr cash_clearing, matched to Faro's remittance wire in Banking), Cr A/R = payment;
 *   - Receive Payment (payments/apply.service.ts, customer-payments.routes.ts): the customer may pay IH35 directly only the
 *     NON-purchased part — open − unrelieved purchased gross; more belongs to Faro's purchased portion.
 *
 * unrelieved(line) = line.gross_cents − net 2150 debits already posted by this line's Faro reserve entries (customer
 * payments, short-pays) on live, unreversed journal entries.
 */
import { resolveRoleAccount } from "../accounting/coa-roles/resolver.service.js";

type Db = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };

const RELIEVED_SQL = `
  SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::bigint AS relieved
    FROM accounting.journal_entry_postings p
    JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
    JOIN accounting.faro_reserve_entries e ON p.source_transaction_type = 'faro_reserve_entry' AND p.source_transaction_id = e.id::text
   WHERE p.operating_company_id = $1::uuid AND p.account_id = $2::uuid AND e.faro_invoice_number = $3
     AND j.voided_at IS NULL AND j.reversed_by_je_id IS NULL AND j.reverses_je_id IS NULL AND p.reversal_of_line_id IS NULL`;

/** Purchased gross of one live purchase line that 2150 still owes Faro. */
export async function unrelievedPurchasedGrossCents(client: Db, oci: string, purchaseLineId: string): Promise<number> {
  const line = (await client.query<{ gross: string; faro: string | null }>(
    `SELECT l.gross_cents::text AS gross, l.faro_invoice_number AS faro
       FROM accounting.factoring_purchase_lines l JOIN accounting.factoring_purchases p ON p.id = l.purchase_id
      WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid AND l.voided_at IS NULL AND p.voided_at IS NULL`,
    [purchaseLineId, oci]
  )).rows[0];
  if (!line) return 0;
  const gross = Number(line.gross);
  if (!line.faro) return gross;
  const liability = await resolveRoleAccount(client as never, oci, "factoring_advance_liability");
  const relieved = Number((await client.query<{ relieved: string }>(RELIEVED_SQL, [oci, liability, line.faro])).rows[0]?.relieved ?? 0);
  return Math.max(0, gross - relieved);
}

/** Sum over the invoice's live purchase lines on posted purchases (an invoice not on a posted purchase → 0). */
export async function invoiceUnrelievedPurchasedGrossCents(client: Db, oci: string, invoiceId: string): Promise<number> {
  const lines = (await client.query<{ id: string }>(
    `SELECT l.id::text FROM accounting.factoring_purchase_lines l JOIN accounting.factoring_purchases p ON p.id = l.purchase_id
      WHERE l.invoice_id = $1::uuid AND l.operating_company_id = $2::uuid AND l.voided_at IS NULL AND p.voided_at IS NULL AND p.status = 'posted'`,
    [invoiceId, oci]
  )).rows;
  let sum = 0;
  for (const l of lines) sum += await unrelievedPurchasedGrossCents(client, oci, l.id);
  return sum;
}

/** What a customer may pay IH35 DIRECTLY on this invoice: open − purchased gross still owed to Faro (never below 0). */
export async function directPaymentRoomCents(client: Db, oci: string, invoiceId: string, openCents: number): Promise<number> {
  return Math.max(0, openCents - (await invoiceUnrelievedPurchasedGrossCents(client, oci, invoiceId)));
}
