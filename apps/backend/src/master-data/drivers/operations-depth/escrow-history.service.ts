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
  const totalRes = await client.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM driver_finance.escrow_ledger
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<EscrowHistoryRow>(
    `
      SELECT
        id::text AS uuid,
        driver_id::text,
        operating_company_id::text,
        transaction_type AS entry_type,
        to_char(amount_cents / 100.0, 'FM999999990.00') AS amount,
        to_char(running_balance_cents / 100.0, 'FM999999990.00') AS running_balance,
        settlement_id::text,
        settlement_line_id::text,
        je.journal_entry_id::text,
        created_at::text
      FROM driver_finance.escrow_ledger el
      -- SAF-B22 (GL leg): resolve the posted journal entry, but ONLY when the match is
      -- unambiguous. A settlement can carry more than one escrow posting, and showing the WRONG
      -- journal entry on a driver's money is worse than showing none — so this returns the JE only
      -- when every candidate posting agrees on it, and NULL otherwise. Driver-scoped through the
      -- accounting.escrow_accounts bridge (holder_type='driver') so one driver can never surface
      -- another's GL entry, and company-scoped on both tables. accounting.* is FORCE-RLS with a
      -- policy on app.operating_company_id, which this route sets (routes.ts:66), and ih35_app holds
      -- SELECT on both tables — all four verified on prod before writing this join.
      LEFT JOIN LATERAL (
        SELECT CASE
                 WHEN count(DISTINCT ep.linked_journal_entry_id) = 1
                 -- min(uuid) does not exist in Postgres; array_agg DISTINCT is the correct way to
                 -- take "the single distinct value" (caught by executing this against prod, not by
                 -- reading it).
                 THEN (array_agg(DISTINCT ep.linked_journal_entry_id))[1]
               END AS journal_entry_id
        FROM accounting.escrow_postings ep
        JOIN accounting.escrow_accounts ea
          ON ea.id = ep.escrow_account_id
         AND ea.holder_type = 'driver'
         AND ea.holder_id = el.driver_id
         AND ea.operating_company_id = el.operating_company_id
        WHERE ep.operating_company_id = el.operating_company_id
          AND ep.source_type = 'driver_settlement'
          AND ep.source_id = el.settlement_id
          AND ep.linked_journal_entry_id IS NOT NULL
      ) je ON el.settlement_id IS NOT NULL
      WHERE el.driver_id = $1::uuid
        AND el.operating_company_id = $2::uuid
      ORDER BY el.created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
