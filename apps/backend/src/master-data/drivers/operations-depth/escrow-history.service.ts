import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type EscrowHistoryRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  entry_type: string | null;
  amount: string | null;
  running_balance: string | null;
  created_at: string;
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
        created_at::text
      FROM driver_finance.escrow_ledger
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
