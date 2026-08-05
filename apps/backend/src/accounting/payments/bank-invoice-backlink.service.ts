/**
 * HOP 9 (bank path) — stamp the reverse link from a bank transaction to the invoice its payment settled.
 *
 * THE GAP THIS CLOSES
 * `banking.bank_transactions.matched_invoice_id` and `.matched_payment_id` had **zero writers anywhere
 * in the backend** — verified by repo-wide search. Both columns exist, the Banking UI reads them, and
 * the scenario tracker's hop.bank predicate is literally "a bank line matched to an invoice", which
 * measured **0 on prod**. So the last hop of the money slice was structurally unreachable: a customer
 * could pay, the payment could apply to the invoice, the GL could post, and the bank line that actually
 * carried the cash stayed unlinked forever.
 *
 * That is a real reconciliation hole, not a cosmetic one. Without this link:
 *   * bank reconciliation cannot tell a settled receipt from an uncategorized deposit;
 *   * an invoice's drill-through stops at the payment and never reaches the cash that cleared;
 *   * collections cannot prove WHICH deposit paid an invoice when a customer disputes it.
 *
 * WHAT IT DOES
 * After a payment is applied to invoices, if that payment names a source bank transaction, write the
 * back-link onto that bank row: matched_invoice_id (the invoice settled) and matched_payment_id.
 *
 * DELIBERATE CONSTRAINTS
 *  * Entity-scoped on both sides — a payment may never stamp another company's bank row.
 *  * Only fills a NULL. An existing match is left alone and reported, because silently repointing a
 *    reconciled bank line is how a reconciliation that a human already signed off gets rewritten.
 *  * Exactly one invoice application -> link it. Several -> leave NULL and say so: a single bank line
 *    settling three invoices has no single matched_invoice_id, and picking the largest (or the first)
 *    would invent a fact. The payment↔invoice truth already lives in accounting.payment_applications;
 *    this column is a convenience pointer and must not pretend to be more.
 *  * NEVER throws into the payment path. A back-link is linkage, not money — if it fails, the payment
 *    and its GL entry must still stand. Failures return a reason.
 */

type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export type BankInvoiceBacklinkResult =
  | { linked: false; reason: "no_source_bank_transaction" | "no_single_invoice" | "already_matched" | "bank_row_not_found" | "error"; detail?: string }
  | { linked: true; bank_transaction_id: string; invoice_id: string };

/**
 * @param paymentId  the accounting.payments row just applied
 * @param invoiceIds the invoice targets of THIS apply call
 */
export async function backlinkBankTransactionToInvoice(
  client: Queryable,
  operatingCompanyId: string,
  paymentId: string,
  invoiceIds: string[]
): Promise<BankInvoiceBacklinkResult> {
  try {
    // One bank line settling several invoices has no single matched_invoice_id. Refuse rather than pick.
    const unique = Array.from(new Set(invoiceIds.filter(Boolean)));
    if (unique.length !== 1) {
      return { linked: false, reason: "no_single_invoice", detail: `${unique.length} invoice target(s) in this apply` };
    }
    const invoiceId = unique[0];

    const payRes = await client.query<{ source_bank_transaction_id: string | null }>(
      `
        SELECT source_bank_transaction_id::text AS source_bank_transaction_id
        FROM accounting.payments
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [paymentId, operatingCompanyId]
    );
    const bankTxnId = payRes.rows[0]?.source_bank_transaction_id ?? null;
    if (!bankTxnId) return { linked: false, reason: "no_source_bank_transaction" };

    // Fill only a NULL, and only within this entity. An already-matched row is reported, never
    // repointed — a reconciled bank line that a human signed off must not be silently rewritten.
    const upd = await client.query(
      `
        UPDATE banking.bank_transactions
        SET matched_invoice_id = $1::uuid,
            matched_payment_id = $2::uuid,
            updated_at = now()
        WHERE id = $3::uuid
          AND operating_company_id = $4::uuid
          AND matched_invoice_id IS NULL
        RETURNING id::text AS id
      `,
      [invoiceId, paymentId, bankTxnId, operatingCompanyId]
    );
    if ((upd.rowCount ?? 0) > 0) {
      return { linked: true, bank_transaction_id: bankTxnId, invoice_id: invoiceId };
    }

    // Distinguish "already matched" from "not our row" so the caller's audit line is truthful.
    const exists = await client.query<{ matched: string | null }>(
      `
        SELECT matched_invoice_id::text AS matched
        FROM banking.bank_transactions
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [bankTxnId, operatingCompanyId]
    );
    if (exists.rows.length === 0) return { linked: false, reason: "bank_row_not_found" };
    return { linked: false, reason: "already_matched", detail: `already matched to invoice ${exists.rows[0]?.matched}` };
  } catch (error) {
    // Linkage must never take down a payment that already moved money.
    return { linked: false, reason: "error", detail: error instanceof Error ? error.message : String(error) };
  }
}
