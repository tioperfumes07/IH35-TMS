import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type EscrowHistoryRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  entry_type: string | null;
  amount: string | null;
  running_balance: string | null;
  created_at: string;
  /**
   * SAF-B22 — driver_finance.escrow_ledger has carried settlement_id / settlement_line_id since it
   * was created and this service selected neither, so escrow history was a column of amounts with
   * no way back to the settlement that produced them. Every serious system makes this hop: McLeod
   * drills an escrow movement to the settlement it was deducted on, NetSuite drills a subledger row
   * to its source transaction, QuickBooks drills a liability register line to the transaction that
   * created it. A balance you cannot trace to its source is not auditable.
   */
  settlement_id: string | null;
  settlement_line_id: string | null;
  /**
   * SAF-B22 (GL leg) — the journal entry the movement posted to. There is no direct FK from
   * driver_finance.escrow_ledger to the GL; the link lives on accounting.escrow_postings, whose
   * (source_type, source_id) is polymorphic. Verified against the two real writers on prod:
   * settlement-payrun-close.service.ts posts source_type='driver_settlement' with
   * source_id = the settlement id and linked_journal_entry_id = the JE it just posted, and
   * escrow-forfeit.service.ts posts source_type='forfeit' with source_id = the liability id.
   * Only the settlement path shares a key with the ledger row, so only that path is resolved here.
   */
  journal_entry_id: string | null;
  /**
   * SAF-B22 (bank leg) — the bank transaction that actually moved the cash. There is deliberately NO
   * direct escrow->bank FK, and adding one would be a modelling error: escrow is a WITHHOLDING, not
   * a separate cash movement. The money moves exactly once, when the settlement is paid, so the
   * correct path is escrow movement -> settlement -> driver_settlements.paid_via_bank_txn_id. That
   * is how McLeod and NetSuite model a driver reserve: the reserve line is a deduction on the
   * settlement, and the bank record belongs to the settlement payment.
   */
  bank_transaction_id: string | null;
};

/**
 * Driver escrow history — deposits, forfeitures and releases against the escrow ledger.
 * Scoped to one driver inside one operating company; paged for large drivers.
 *
 * §4 fix (2026-07-06): real columns are `transaction_type` / `amount_cents` / `running_balance_cents`
 * (migration 202606120600) but the frontend's EscrowHistoryView column keys were `entry_type` /
 * `amount` / `running_balance` — a name mismatch that silently rendered every cell "—". Aliased to
 * the frontend's real keys, and the cents columns are converted to formatted dollar strings here
 * (OperationsHistoryTable has no cents-aware formatter — displaying the raw integer would have shown
 * e.g. "150000" instead of "1500.00").
 */
export async function getDriverEscrowHistory(
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string,
  opts: OperationsPagingOpts = {}
): Promise<OperationsResult<EscrowHistoryRow>> {
  const { page, page_size, limit, offset } = resolvePaging(opts);
  // KILL-THE-SECOND-SYSTEM (CC-1): escrow history IS the GL register of the driver's own 2100-00-<nnn> sub-account —
  // one row per posted journal-entry line, the running balance computed from the postings (never a stored
  // running_balance_cents). Each row carries its own journal entry, so the screen drills number -> account ->
  // posting -> source document. The ledger rows still exist; the number no longer comes from them.
  const totalRes = await client.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM accounting.journal_entry_postings p
      JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid AND j.status = 'posted'
      JOIN accounting.escrow_accounts ea
        ON ea.coa_account_id = p.account_id
       AND ea.holder_type = 'driver'
       AND ea.holder_id = $1::uuid
       AND ea.operating_company_id = $2::uuid
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<EscrowHistoryRow>(
    `
      WITH reg AS (
        SELECT p.id, p.operating_company_id, p.debit_or_credit, p.amount_cents, p.created_at,
               p.source_transaction_type, p.source_transaction_id, j.id AS journal_entry_id, j.entry_date,
               j.reverses_je_id,
               sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END)
                 OVER (ORDER BY j.entry_date, p.created_at, p.id) AS running_cents
          FROM accounting.journal_entry_postings p
          JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid AND j.status = 'posted'
          JOIN accounting.escrow_accounts ea
            ON ea.coa_account_id = p.account_id
           AND ea.holder_type = 'driver'
           AND ea.holder_id = $1::uuid
           AND ea.operating_company_id = $2::uuid
      )
      SELECT
        reg.id::text AS uuid,
        $1::text AS driver_id,
        reg.operating_company_id::text,
        CASE WHEN reg.reverses_je_id IS NOT NULL THEN 'reversal'
             WHEN reg.debit_or_credit = 'credit' THEN 'hold'
             ELSE 'release' END AS entry_type,
        to_char((CASE WHEN reg.debit_or_credit = 'credit' THEN reg.amount_cents ELSE -reg.amount_cents END) / 100.0, 'FM999999990.00') AS amount,
        to_char(reg.running_cents / 100.0, 'FM999999990.00') AS running_balance,
        CASE WHEN reg.source_transaction_type = 'driver_settlement' THEN reg.source_transaction_id::text END AS settlement_id,
        NULL::text AS settlement_line_id,
        reg.journal_entry_id::text,
        ds.paid_via_bank_txn_id::text AS bank_transaction_id,
        reg.created_at::text
      FROM reg
      -- The settlement carries the cash record (escrow is a withholding; the money moves once, when the settlement is
      -- paid). Company-scoped; FORCE-RLS on app.operating_company_id, which this route sets.
      LEFT JOIN driver_finance.driver_settlements ds
        ON reg.source_transaction_type = 'driver_settlement'
       AND ds.id::text = reg.source_transaction_id::text
       AND ds.operating_company_id = reg.operating_company_id
      ORDER BY reg.entry_date DESC, reg.created_at DESC, reg.id DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
