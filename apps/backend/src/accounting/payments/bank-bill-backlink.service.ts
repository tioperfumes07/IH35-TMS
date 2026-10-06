/**
 * HOP 9 (bank path, AP twin) — stamp the reverse link from a bank transaction to the bill
 * its bill payment settled.
 *
 * THE GAP THIS CLOSES
 * `banking.bank_transactions.matched_bill_id` existed, bills.service.ts drilled it
 * (`bt.matched_bill_id = $1`), and the Banking UI read it. Repo-wide search of apps/
 * found ZERO accept writers — only NULL clears (void / unmatch / state-machine) and a
 * COALESCE merge on bank-tx dedup. Payment accept already filled `matched_invoice_id`
 * via backlinkBankTransactionToInvoice (ACCT-F5620). Bill-payment accept stamped
 * `matched_bill_payment_id` + `source_bank_transaction_id` and stopped (CLS-LINKAGE-ONEWAY).
 * A vendor bill's bank hop stayed structurally unreachable after purge-and-recreate.
 *
 * WHAT IT DOES
 * After a bill payment names a source bank transaction, write the back-link onto that
 * bank row: matched_bill_id (the bill settled) and matched_bill_payment_id.
 *
 * DELIBERATE CONSTRAINTS — same as bank-invoice-backlink.service.ts
 *  * Entity-scoped on both sides.
 *  * Fill-only-NULL. Never repoint a reconciled line.
 *  * Exactly one bill → link it. Several → leave NULL (do not invent).
 *    Truth lives on accounting.bill_payments.bill_id; this column is a convenience pointer.
 *  * NEVER throws into the bill-payment / match path. Linkage is not money.
 */

type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export type BankBillBacklinkResult =
  | { linked: false; reason: "no_source_bank_transaction" | "no_single_bill" | "already_matched" | "bank_row_not_found" | "error"; detail?: string }
  | { linked: true; bank_transaction_id: string; bill_id: string };

/**
 * @param billPaymentId the accounting.bill_payments row just reverse-stamped
 * @param billIds       the bill targets of THIS payment (usually one: bill_payments.bill_id)
 */
export async function backlinkBankTransactionToBill(
  client: Queryable,
  operatingCompanyId: string,
  billPaymentId: string,
  billIds: string[]
): Promise<BankBillBacklinkResult> {
  // Optional read inside a transaction must use its own SAVEPOINT so a failure does not
  // poison the caller's transaction with a 25P02 (current transaction is aborted).
  await client.query("SAVEPOINT svp_backlink_optional");
  try {
    const unique = Array.from(new Set(billIds.filter(Boolean)));
    if (unique.length !== 1) {
      return { linked: false, reason: "no_single_bill", detail: `${unique.length} bill target(s) in this apply` };
    }
    const billId = unique[0];

    const payRes = await client.query<{ source_bank_transaction_id: string | null }>(
      `
        SELECT source_bank_transaction_id::text AS source_bank_transaction_id
        FROM accounting.bill_payments
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [billPaymentId, operatingCompanyId]
    );
    const bankTxnId = payRes.rows[0]?.source_bank_transaction_id ?? null;
    if (!bankTxnId) {
      await client.query("RELEASE SAVEPOINT svp_backlink_optional");
      return { linked: false, reason: "no_source_bank_transaction" };
    }

    const upd = await client.query(
      `
        UPDATE banking.bank_transactions
        SET matched_bill_id = $1::uuid,
            matched_bill_payment_id = COALESCE(matched_bill_payment_id, $2::uuid),
            updated_at = now()
        WHERE id = $3::uuid
          AND operating_company_id = $4::uuid
          AND matched_bill_id IS NULL
        RETURNING id::text AS id
      `,
      [billId, billPaymentId, bankTxnId, operatingCompanyId]
    );
    if ((upd.rowCount ?? 0) > 0) {
      await client.query("RELEASE SAVEPOINT svp_backlink_optional");
      return { linked: true, bank_transaction_id: bankTxnId, bill_id: billId };
    }

    const exists = await client.query<{ matched: string | null }>(
      `
        SELECT matched_bill_id::text AS matched
        FROM banking.bank_transactions
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [bankTxnId, operatingCompanyId]
    );
    if (exists.rows.length === 0) {
      await client.query("RELEASE SAVEPOINT svp_backlink_optional");
      return { linked: false, reason: "bank_row_not_found" };
    }
    await client.query("RELEASE SAVEPOINT svp_backlink_optional");
    return { linked: false, reason: "already_matched", detail: `already matched to bill ${exists.rows[0]?.matched}` };
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT svp_backlink_optional");
    await client.query("RELEASE SAVEPOINT svp_backlink_optional");
    return { linked: false, reason: "error", detail: error instanceof Error ? error.message : String(error) };
  }
}
