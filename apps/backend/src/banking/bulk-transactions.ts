import type { PoolClient } from "pg";
import { enqueueAccountingOutbox } from "../accounting/outbox-events.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { postSourceTransaction, PostingEngineError } from "../accounting/posting-engine.service.js";
import { postBillPaymentGlIfEnabled } from "../accounting/bill-payment-gl.service.js";
import { withCurrentUser } from "../auth/db.js";
import { assertBankTxnsNotInReconciledSession } from "./closed-session-immutability.js";
import { resolveMdataVendorIdBestEffort, resolveVendorIsSampleDataBestEffort } from "../accounting/bills.service.js";

const BILL_GL_POSTING_FLAG_KEY = "BILL_GL_POSTING_ENABLED";

export const BULK_TXN_MAX = 500;

export type BulkCategorizeInput = {
  operatingCompanyId: string;
  txnIds: string[];
  psCategory: string;
  psItem: string;
  qboAccountId: string | number;
};

export type BulkPostAsBillsInput = {
  operatingCompanyId: string;
  txnIds: string[];
  vendorId?: string;
  psCategory: string;
  psItem: string;
};

function pendingStatusesSql(): string {
  return `(bt.status = 'pending_categorization' OR bt.status = 'uncategorized')`;
}

export async function resolveCoaAccountId(
  client: PoolClient,
  operatingCompanyId: string,
  qboAccountId: string | number
): Promise<string | null> {
  const qboNumeric =
    typeof qboAccountId === "number"
      ? qboAccountId
      : Number(String(qboAccountId).replace(/[^\d]/g, ""));
  if (!Number.isFinite(qboNumeric)) return null;
  const res = await client.query<{ id: string }>(
    `
      SELECT id
      FROM accounting.coa_account
      WHERE tenant_id = $1::uuid
        AND qbo_id = $2::numeric
      LIMIT 1
    `,
    [operatingCompanyId, qboNumeric]
  );
  return res.rows[0]?.id ?? null;
}

async function assertTxnIdsTenantScoped(
  client: PoolClient,
  operatingCompanyId: string,
  txnIds: string[]
): Promise<void> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id
      FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid
        AND id = ANY($2::uuid[])
    `,
    [operatingCompanyId, txnIds]
  );
  if (res.rows.length !== txnIds.length) {
    throw new Error("bulk_txn_cross_tenant_or_missing");
  }
}

export async function bulkCategorizeTransactions(
  client: PoolClient,
  input: BulkCategorizeInput
): Promise<{ updated_count: number; categorizedIds: string[] }> {
  if (input.txnIds.length > BULK_TXN_MAX) {
    throw new Error("bulk_txn_limit_exceeded");
  }

  const coaAccountId = await resolveCoaAccountId(client, input.operatingCompanyId, input.qboAccountId);
  if (!coaAccountId) {
    throw new Error("qbo_account_not_found");
  }

  await client.query("BEGIN");
  try {
    await assertTxnIdsTenantScoped(client, input.operatingCompanyId, input.txnIds);
    await assertBankTxnsNotInReconciledSession(client, input.txnIds, input.operatingCompanyId);

    const categoryKind = `${input.psCategory}::${input.psItem}`;
    // ACCT-F6284 — categorization_memo is read as a plain-text memo fallback elsewhere (e.g.
    // transfers.service.ts's mintTransferForBankFeedLineInClient), not JSON.parse()'d anywhere; a
    // human sentence here instead of a serialized object avoids poisoning that fallback. The
    // structured fields (category/category_kind, categorization_gl_account_id/coa_account_id) are
    // already stored losslessly in their own dedicated columns by the UPDATE below.
    const memo = `${input.psCategory} — ${input.psItem}`;

    const updateRes = await client.query(
      `
        UPDATE banking.bank_transactions bt
        SET
          status = 'categorized',
          category = $2,
          category_kind = $2,
          categorization_gl_account_id = $3,
          coa_account_id = $3,
          categorization_memo = $4,
          categorized_at = now(),
          updated_at = now(),
          skip_reason = NULL,
          investigate_note = NULL
        WHERE bt.operating_company_id = $1::uuid
          AND bt.id = ANY($5::uuid[])
          AND ${pendingStatusesSql()}
      `,
      [input.operatingCompanyId, categoryKind, coaAccountId, memo, input.txnIds]
    );

    if ((updateRes.rowCount ?? 0) !== input.txnIds.length) {
      throw new Error("bulk_categorize_not_all_pending");
    }

    for (const id of input.txnIds) {
      await enqueueAccountingOutbox(
        client,
        input.operatingCompanyId,
        "qbo.bank_transaction.categorized",
        "bank_transaction",
        id,
        {
          bank_transaction_id: id,
          ps_category: input.psCategory,
          ps_item: input.psItem,
          qbo_account_id: input.qboAccountId,
          bulk: true,
        }
      );
    }

    await client.query("COMMIT");
    // Caller posts CHAIN-05 GL AFTER this txn commits (poster opens its own txn).
    return { updated_count: input.txnIds.length, categorizedIds: [...input.txnIds] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export type BulkPostAsBillsResult = {
  bill_ids: string[];
  bill_payment_ids: string[];
  // BANKING-GL-COMPLETION — per-bill best-effort GL posting outcome (populated AFTER the subledger
  // transaction below commits; a posting failure never rolls back the bill/bill_payment rows).
  gl_posting: Array<{
    bill_id: string;
    bill_payment_id: string;
    bill_posted: boolean;
    bill_payment_posted: boolean;
    error?: string;
  }>;
};

export async function bulkPostTransactionsAsBills(
  client: PoolClient,
  input: BulkPostAsBillsInput,
  userId: string
): Promise<BulkPostAsBillsResult> {
  if (input.txnIds.length > BULK_TXN_MAX) {
    throw new Error("bulk_txn_limit_exceeded");
  }

  await client.query("BEGIN");
  let created: Array<{ billId: string; billPaymentId: string }> = [];
  try {
    await assertTxnIdsTenantScoped(client, input.operatingCompanyId, input.txnIds);
    await assertBankTxnsNotInReconciledSession(client, input.txnIds, input.operatingCompanyId);

    const txRes = await client.query<{
      id: string;
      amount_cents: number;
      transaction_date: string;
      description: string | null;
      suggested_vendor_id: string | null;
      categorization_vendor_id: string | null;
      bank_account_id: string | null;
    }>(
      `
        SELECT
          id,
          amount_cents,
          transaction_date::text AS transaction_date,
          description,
          suggested_vendor_id,
          categorization_vendor_id,
          bank_account_id
        FROM banking.bank_transactions bt
        WHERE bt.operating_company_id = $1::uuid
          AND bt.id = ANY($2::uuid[])
          AND ${pendingStatusesSql()}
        ORDER BY bt.transaction_date ASC, bt.id ASC
      `,
      [input.operatingCompanyId, input.txnIds]
    );

    if (txRes.rows.length !== input.txnIds.length) {
      throw new Error("bulk_post_not_all_pending");
    }

    const billIds: string[] = [];
    const billPaymentIds: string[] = [];
    for (const txn of txRes.rows) {
      const vendorId =
        input.vendorId ??
        (txn.categorization_vendor_id ? String(txn.categorization_vendor_id) : null) ??
        (txn.suggested_vendor_id ? String(txn.suggested_vendor_id) : null);
      if (!vendorId) {
        throw new Error("bulk_post_vendor_required");
      }

      const amountCents = Math.abs(Number(txn.amount_cents ?? 0));
      if (amountCents <= 0) {
        throw new Error("bulk_post_amount_invalid");
      }

      // LV-BILL-MDATA-VENDOR-FK-OPTOUT sweep — vendorId here is already an mdata.vendors uuid
      // (categorization/suggested vendor or an explicit input); best-effort resolve the typed FK so
      // an unresolvable/cross-entity id (shouldn't happen — the source columns are entity-scoped
      // FKs — but never trusted unchecked) doesn't block a bulk post.
      const mdataVendorId = await resolveMdataVendorIdBestEffort(client, input.operatingCompanyId, vendorId);
      // ACCT-F353 — derive from the vendor being paid (same relationship the FK above resolves).
      const vendorIsSampleData = await resolveVendorIsSampleDataBestEffort(client, input.operatingCompanyId, vendorId);

      // PAID-IN-FULL MODEL (owner-approved QBO parity: cash already left the bank at the moment the bank
      // feed shows the cleared transaction — this is NOT a Bill→pay-later A/P scenario). The bill is
      // created ALREADY paid + a matching accounting.bill_payments row credits the real source bank
      // account (from_bank_account_id, resolved via the SAME bank->GL bridge every other bill_payment
      // poster uses) so the GL leg the posting engine builds actually reduces cash, not a phantom A/P.
      const billRes = await client.query<{ id: string }>(
        `
          INSERT INTO accounting.bills (
            operating_company_id,
            vendor_id,
            vendor_uuid,
            mdata_vendor_id,
            bill_date,
            due_date,
            amount_cents,
            total_amount,
            paid_cents,
            paid_amount,
            status,
            memo,
            created_by_user_id,
            created_at,
            updated_at,
            -- ACCT-F353 — derived from the vendor being paid (vendorIsSampleData above).
            is_sample_data
          )
          VALUES ($1,$2,$2,$8,$3,$3,$4,$5,$4,$5,'paid',$6,$7,now(),now(),$9)
          RETURNING id
        `,
        [
          input.operatingCompanyId,
          vendorId,
          txn.transaction_date,
          amountCents,
          amountCents / 100,
          // ACCT-F6284 — see the memo comment above; plain sentence, not a serialized object, in a
          // free-text memo column. bank_transaction_id is already carried losslessly by
          // source_bank_transaction_id (bound below); ps_category/ps_item are already the bill_lines
          // description text two statements down.
          `Bank transaction bulk-post: ${input.psCategory} — ${input.psItem} (bank_txn ${txn.id})`,
          userId,
          mdataVendorId,
          vendorIsSampleData,
        ]
      );
      const billId = billRes.rows[0]?.id;
      if (!billId) throw new Error("bulk_post_bill_insert_failed");
      billIds.push(billId);

      // The GL poster reads accounting.bill_lines, not the header (same rule CHAIN-03 enforces
      // everywhere else — see settlement-bill-payment-posting.service.ts). ps_category/ps_item here are
      // free-text QBO Product/Service labels, not a resolvable expense_category_account_map key, so this
      // single line carries NO category — it resolves via THE canonical resolver's Tier-3
      // "uncategorized_expense" role (QBO-25 behavior: an unmapped category books to Uncategorized
      // Expense rather than silently guessing or failing the whole batch).
      await client.query(
        `INSERT INTO accounting.bill_lines (bill_id, line_sequence, amount, description)
         VALUES ($1::uuid, 1, $2, $3)
         ON CONFLICT (bill_id, line_sequence) DO NOTHING`,
        [billId, amountCents / 100, `${input.psCategory} — ${input.psItem}`.slice(0, 500)]
      );

      const paymentRes = await client.query<{ id: string }>(
        `
          INSERT INTO accounting.bill_payments (
            operating_company_id,
            bill_id,
            vendor_id,
            payment_date,
            amount_cents,
            amount,
            payment_method,
            from_bank_account_id,
            memo,
            status,
            payment_source_kind,
            source_bank_transaction_id,
            created_by_user_id,
            created_at,
            updated_at,
            -- ACCT-F353 — same derivation as the bill row two statements up (vendorIsSampleData).
            is_sample_data
          )
          VALUES ($1,$2,$3,$4,$5,$6,'ach',$7,$8,'posted','bank_tx_bulk_post',$9,$10,now(),now(),$11)
          RETURNING id
        `,
        [
          input.operatingCompanyId,
          billId,
          vendorId,
          txn.transaction_date,
          amountCents,
          amountCents / 100,
          txn.bank_account_id,
          // ACCT-F6284 — same reasoning; source_bank_transaction_id (bound below) already carries
          // the transaction reference.
          `Bank transaction bulk-post payment (bank_txn ${txn.id})`,
          txn.id,
          userId,
          vendorIsSampleData,
        ]
      );
      const billPaymentId = paymentRes.rows[0]?.id;
      if (!billPaymentId) throw new Error("bulk_post_bill_payment_insert_failed");
      billPaymentIds.push(billPaymentId);
      created.push({ billId, billPaymentId });

      await client.query(
        `
          UPDATE banking.bank_transactions
          SET
            status = 'categorized',
            category = 'bill',
            category_kind = $2,
            linked_entity_id = $3::uuid,
            categorization_vendor_id = COALESCE(categorization_vendor_id, $4::uuid),
            categorization_memo = $5,
            categorized_at = now(),
            updated_at = now()
          WHERE id = $1
            AND operating_company_id = $6::uuid
        `,
        [
          txn.id,
          `${input.psCategory}::${input.psItem}`,
          billId,
          vendorId,
          // ACCT-F6284 — plain sentence; linked_entity_id (bound above) already carries billId
          // losslessly and category_kind already carries ps_category/ps_item.
          `${input.psCategory} — ${input.psItem} (bill ${billId})`,
          input.operatingCompanyId,
        ]
      );
    }

    await client.query("COMMIT");

    // BANKING-GL-COMPLETION — post the A/P leg then the cash leg AFTER the subledger transaction above
    // committed (postSourceTransaction opens its OWN transaction on its own connection; calling it from
    // inside the still-open insert transaction would self-deadlock on the very row it needs to lock).
    // Best-effort + per-bill: gated by the EXISTING BILL_GL_POSTING_ENABLED / BILL_PAYMENT_GL_POSTING_ENABLED
    // flags (both default OFF, no new flags) — with either flag off this is a strict no-op, matching every
    // other poster's dark-by-default contract.
    const glPosting = await postCreatedBillsGl(input.operatingCompanyId, created, userId);

    return { bill_ids: billIds, bill_payment_ids: billPaymentIds, gl_posting: glPosting };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/**
 * BANKING-GL-COMPLETION — shared post-commit GL step for a "post as bill, paid-in-full" batch. Reused
 * verbatim by bank-transaction-splits.service.ts's per-line vendor-bill branch (same shape: a freshly
 * committed bill + its full-amount bill_payment). MUST be called only AFTER the bill/bill_payment rows are
 * committed (each postSourceTransaction call opens its own transaction on its own connection — calling it
 * from inside the still-open insert transaction would self-deadlock on the row's own lock).
 *
 * Gated by the EXISTING BILL_GL_POSTING_ENABLED (bill A/P leg) and BILL_PAYMENT_GL_POSTING_ENABLED (cash
 * leg) flags — both default OFF, no new flags introduced. Best-effort per pair: one bill's posting failure
 * never blocks the rest of the batch or unwinds the already-committed subledger rows.
 */
export async function postCreatedBillsGl(
  operatingCompanyId: string,
  pairs: Array<{ billId: string; billPaymentId: string }>,
  userId: string
): Promise<BulkPostAsBillsResult["gl_posting"]> {
  if (pairs.length === 0) return [];

  const billGlEnabled = await withCurrentUserFlagCheck(operatingCompanyId, userId, BILL_GL_POSTING_FLAG_KEY);

  const results: BulkPostAsBillsResult["gl_posting"] = [];
  for (const pair of pairs) {
    let billPosted = false;
    let billPaymentPosted = false;
    let errorMessage: string | undefined;
    try {
      if (billGlEnabled) {
        await postSourceTransaction(
          { operating_company_id: operatingCompanyId, source_transaction_type: "bill", source_transaction_id: pair.billId },
          { userId }
        );
        billPosted = true;
      }
      if (billPosted) {
        const outcome = await postBillPaymentGlIfEnabled(operatingCompanyId, pair.billPaymentId, { userId });
        billPaymentPosted = outcome.posted;
      }
    } catch (err) {
      errorMessage =
        err instanceof PostingEngineError ? `${err.code}: ${err.message}` : String((err as Error)?.message ?? err);
    }
    results.push({
      bill_id: pair.billId,
      bill_payment_id: pair.billPaymentId,
      bill_posted: billPosted,
      bill_payment_posted: billPaymentPosted,
      ...(errorMessage ? { error: errorMessage } : {}),
    });
  }
  return results;
}

async function withCurrentUserFlagCheck(operatingCompanyId: string, userId: string, flagKey: string): Promise<boolean> {
  return withCurrentUser(userId, async (dbClient) => {
    await dbClient.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return isEnabled(dbClient, flagKey, { operating_company_id: operatingCompanyId, user_uuid: userId });
  });
}
