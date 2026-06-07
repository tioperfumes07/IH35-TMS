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
        entry_type,
        amount::text,
        running_balance::text,
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
