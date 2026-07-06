import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type DebtHistoryRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  purpose: string | null;
  amount: string | null;
  outstanding_balance: string | null;
  status: string | null;
  created_at: string;
};

/**
 * Driver debt history — all advances / liabilities plus remaining balances.
 * Scoped to one driver inside one operating company; paged for large drivers.
 */
export async function getDriverDebtHistory(
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string,
  opts: OperationsPagingOpts = {}
): Promise<OperationsResult<DebtHistoryRow>> {
  const { page, page_size, limit, offset } = resolvePaging(opts);
  const totalRes = await client.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM driver_finance.driver_advances
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<DebtHistoryRow>(
    `
      SELECT
        id::text AS uuid,
        driver_id::text,
        operating_company_id::text,
        purpose,
        amount::text,
        outstanding_balance::text,
        status,
        created_at::text
      FROM driver_finance.driver_advances
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
