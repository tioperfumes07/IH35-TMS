import type { PoolClient } from "pg";
import { enqueueAccountingOutbox } from "../accounting/outbox-events.js";

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
      WHERE operating_company_id = $1
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
): Promise<{ updated_count: number }> {
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

    const categoryKind = `${input.psCategory}::${input.psItem}`;
    const memo = JSON.stringify({
      ps_category: input.psCategory,
      ps_item: input.psItem,
      qbo_account_id: input.qboAccountId,
    });

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
        WHERE bt.operating_company_id = $1
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
    return { updated_count: input.txnIds.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function bulkPostTransactionsAsBills(
  client: PoolClient,
  input: BulkPostAsBillsInput,
  userId: string
): Promise<{ bill_ids: string[] }> {
  if (input.txnIds.length > BULK_TXN_MAX) {
    throw new Error("bulk_txn_limit_exceeded");
  }

  await client.query("BEGIN");
  try {
    await assertTxnIdsTenantScoped(client, input.operatingCompanyId, input.txnIds);

    const txRes = await client.query<{
      id: string;
      amount_cents: number;
      transaction_date: string;
      description: string | null;
      suggested_vendor_id: string | null;
      categorization_vendor_id: string | null;
    }>(
      `
        SELECT
          id,
          amount_cents,
          transaction_date::text AS transaction_date,
          description,
          suggested_vendor_id,
          categorization_vendor_id
        FROM banking.bank_transactions
        WHERE operating_company_id = $1
          AND id = ANY($2::uuid[])
          AND ${pendingStatusesSql()}
        ORDER BY transaction_date ASC, id ASC
      `,
      [input.operatingCompanyId, input.txnIds]
    );

    if (txRes.rows.length !== input.txnIds.length) {
      throw new Error("bulk_post_not_all_pending");
    }

    const billIds: string[] = [];
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

      const billRes = await client.query<{ id: string }>(
        `
          INSERT INTO accounting.bills (
            operating_company_id,
            vendor_id,
            vendor_uuid,
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
            updated_at
          )
          VALUES ($1,$2,$2,$3,$3,$4,$5,0,0,'unpaid',$6,$7,now(),now())
          RETURNING id
        `,
        [
          input.operatingCompanyId,
          vendorId,
          txn.transaction_date,
          amountCents,
          amountCents / 100,
          JSON.stringify({
            source: "bank_tx_bulk_post",
            bank_transaction_id: txn.id,
            ps_category: input.psCategory,
            ps_item: input.psItem,
            description: txn.description,
          }),
          userId,
        ]
      );
      const billId = billRes.rows[0]?.id;
      if (!billId) throw new Error("bulk_post_bill_insert_failed");
      billIds.push(billId);

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
            AND operating_company_id = $6
        `,
        [
          txn.id,
          `${input.psCategory}::${input.psItem}`,
          billId,
          vendorId,
          JSON.stringify({ ps_category: input.psCategory, ps_item: input.psItem, bill_id: billId }),
          input.operatingCompanyId,
        ]
      );
    }

    await client.query("COMMIT");
    return { bill_ids: billIds };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
