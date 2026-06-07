import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type FuelHistoryRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  transaction_date: string | null;
  merchant: string | null;
  gallons: string | null;
  total_amount: string | null;
  created_at: string;
};

/**
 * Driver fuel history — per-driver fuel transactions.
 * Scoped to one driver inside one operating company; paged for large drivers.
 */
export async function getDriverFuelHistory(
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string,
  opts: OperationsPagingOpts = {}
): Promise<OperationsResult<FuelHistoryRow>> {
  const { page, page_size, limit, offset } = resolvePaging(opts);
  const totalRes = await client.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM fuel.fuel_transactions
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<FuelHistoryRow>(
    `
      SELECT
        id::text AS uuid,
        driver_id::text,
        operating_company_id::text,
        transaction_date::text,
        merchant,
        gallons::text,
        total_amount::text,
        created_at::text
      FROM fuel.fuel_transactions
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
      ORDER BY transaction_date DESC NULLS LAST, created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
