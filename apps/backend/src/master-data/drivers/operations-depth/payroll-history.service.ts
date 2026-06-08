import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type PayrollHistoryRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  period_start: string | null;
  period_end: string | null;
  gross_pay: string | null;
  net_pay: string | null;
  status: string | null;
  created_at: string;
};

/**
 * Driver payroll history — settlement runs that paid this driver.
 * Scoped to one driver inside one operating company; paged for large drivers.
 */
export async function getDriverPayrollHistory(
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string,
  opts: OperationsPagingOpts = {}
): Promise<OperationsResult<PayrollHistoryRow>> {
  const { page, page_size, limit, offset } = resolvePaging(opts);
  const totalRes = await client.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM payroll.driver_settlements
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<PayrollHistoryRow>(
    `
      SELECT
        id::text AS uuid,
        driver_id::text,
        operating_company_id::text,
        period_start::text,
        period_end::text,
        gross_pay::text,
        net_pay::text,
        status,
        created_at::text
      FROM payroll.driver_settlements
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
      ORDER BY period_end DESC NULLS LAST, created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
