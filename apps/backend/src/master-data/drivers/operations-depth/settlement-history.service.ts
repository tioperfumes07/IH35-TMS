import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type SettlementHistoryRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  settlement_number: string | null;
  period_end: string | null;
  total_amount: string | null;
  status: string | null;
  created_at: string;
};

/**
 * Driver settlement history — per-settlement summary for drill-down.
 * Scoped to one driver inside one operating company; paged for large drivers.
 */
export async function getDriverSettlementHistory(
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string,
  opts: OperationsPagingOpts = {}
): Promise<OperationsResult<SettlementHistoryRow>> {
  const { page, page_size, limit, offset } = resolvePaging(opts);
  const totalRes = await client.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM driver_finance.driver_settlements
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<SettlementHistoryRow>(
    `
      SELECT
        id::text AS uuid,
        driver_id::text,
        operating_company_id::text,
        settlement_number,
        period_end::text,
        total_amount::text,
        status,
        created_at::text
      FROM driver_finance.driver_settlements
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
      ORDER BY period_end DESC NULLS LAST, created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
