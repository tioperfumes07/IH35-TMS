// BANK-ORPHAN-01 BACKFILL — one-time sweep for bank_transactions rows that were left status='categorized'
// against a document that has SINCE been voided, from BEFORE void.service.ts's postVoidReversal grew the
// unconditional unmatchBankTransactionsForVoid call. That fix only covers FUTURE voids — it cannot reach
// back and correct a bank_transactions row whose matching document already voided before the fix shipped
// (there is no future "void" event left to fire for it). This is that reach-back, shaped exactly like
// driver-subaccount-backfill.service.ts: DEFAULT MODE = DRY-RUN (zero writes), apply=true required for any
// write, reusing the SAME shared primitive (unmatchBankTransactionById) the live cascade uses — no new
// un-match logic invented here.
//
// Live proof this sweep exists to close (2026-08-31): 8b944104-b9b4-403d-8e9a-3c4a6d8ff2a2 $1,200.00,
// 2bdef3a9-25be-4eb4-96cf-832eb66c70ed $1,000.00, 8521d332-b091-4f1f-a5e9-4a1598a1ea4c $1,000.00,
// 5404b1cb-e576-4234-a2e7-54c94726e9fc $2,500.00 -- all still 'categorized' against voided
// accounting.payments rows, all with linked_entity_id NULL (the only surviving link was the REVERSE
// pointer accounting.payments.source_bank_transaction_id). The sweep is general, not hardcoded to these
// four -- it covers every reverse-pointer table (bills, bill_payments, payments) and driver_settlements'
// own paid_via_bank_txn_id, plus the forward pointer (expenses, via linked_entity_id) for completeness.

import { unmatchBankTransactionById } from "../accounting/void.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type BankOrphanVia = "bill" | "bill_payment" | "customer_payment" | "driver_settlement" | "expense";

export type BankOrphanRow = {
  bank_transaction_id: string;
  amount_cents: number | null;
  via: BankOrphanVia;
  /** The voided/reversed document that still matches this bank transaction. */
  source_entity_id: string;
  /** voided_at for bill/bill_payment/customer_payment/expense; reversed_at for driver_settlement. */
  source_voided_or_reversed_at: string | null;
};

export type BankOrphanReport = {
  mode: "dry-run" | "apply";
  operating_company_id: string;
  orphan_count: number;
  /** Only meaningful in apply mode -- how many rows the shared primitive actually reset. */
  unmatched_count: number;
  rows: BankOrphanRow[];
};

async function findOrphans(client: DbClient, operatingCompanyId: string): Promise<BankOrphanRow[]> {
  const r = await client.query<{
    bank_transaction_id: string;
    amount_cents: number | null;
    via: BankOrphanVia;
    source_entity_id: string;
    source_voided_or_reversed_at: string | null;
  }>(
    `
      SELECT bt.id::text AS bank_transaction_id, bt.amount_cents, 'bill'::text AS via,
             b.id::text AS source_entity_id, b.voided_at::text AS source_voided_or_reversed_at
        FROM accounting.bills b
        JOIN banking.bank_transactions bt ON bt.id = b.source_bank_transaction_id
       WHERE b.operating_company_id = $1::uuid AND b.voided_at IS NOT NULL AND bt.status = 'categorized'

      UNION ALL

      SELECT bt.id::text, bt.amount_cents, 'bill_payment'::text,
             bp.id::text, bp.voided_at::text
        FROM accounting.bill_payments bp
        JOIN banking.bank_transactions bt ON bt.id = bp.source_bank_transaction_id
       WHERE bp.operating_company_id = $1::uuid AND bp.voided_at IS NOT NULL AND bt.status = 'categorized'

      UNION ALL

      SELECT bt.id::text, bt.amount_cents, 'customer_payment'::text,
             p.id::text, p.voided_at::text
        FROM accounting.payments p
        JOIN banking.bank_transactions bt ON bt.id = p.source_bank_transaction_id
       WHERE p.operating_company_id = $1::uuid AND p.voided_at IS NOT NULL AND bt.status = 'categorized'

      UNION ALL

      -- driver_settlements has no source_bank_transaction_id-style reverse table -- its OWN column is
      -- the pointer, so this leg is keyed directly on it rather than joining through another entity.
      SELECT bt.id::text, bt.amount_cents, 'driver_settlement'::text,
             s.id::text, s.reversed_at::text
        FROM driver_finance.driver_settlements s
        JOIN banking.bank_transactions bt ON bt.id = s.paid_via_bank_txn_id
       WHERE s.operating_company_id = $1::uuid AND s.status = 'cancelled' AND bt.status = 'categorized'

      UNION ALL

      -- FORWARD pointer: accounting.expenses has no source_bank_transaction_id column at all --
      -- categorize-as-expense sets banking.bank_transactions.linked_entity_id -> expenses.id instead.
      SELECT bt.id::text, bt.amount_cents, 'expense'::text,
             e.id::text, e.voided_at::text
        FROM accounting.expenses e
        JOIN banking.bank_transactions bt ON bt.linked_entity_id = e.id
       WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NOT NULL AND bt.status = 'categorized'

      ORDER BY 1
    `,
    [operatingCompanyId]
  );
  return r.rows;
}

/**
 * BANK-ORPHAN-01 backfill. DEFAULT = DRY-RUN (apply !== true): NO writes -- SELECT only, reports every
 * bank_transactions row still 'categorized' against a voided/reversed document. apply === true resets
 * each found row via the SAME shared unmatchBankTransactionById primitive postVoidReversal uses live.
 */
export async function runBankOrphanBackfill(
  client: DbClient,
  input: { operatingCompanyId: string; apply?: boolean }
): Promise<BankOrphanReport> {
  const apply = input.apply === true; // DEFAULT OFF -- explicit `true` required for any write.
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

  const rows = await findOrphans(client, input.operatingCompanyId);

  let unmatchedCount = 0;
  if (apply) {
    for (const row of rows) {
      const ok = await unmatchBankTransactionById(client, input.operatingCompanyId, row.bank_transaction_id);
      if (ok) unmatchedCount += 1;
    }
  }

  return {
    mode: apply ? "apply" : "dry-run",
    operating_company_id: input.operatingCompanyId,
    orphan_count: rows.length,
    unmatched_count: unmatchedCount,
    rows,
  };
}
