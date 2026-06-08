import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type AccidentHistoryRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  incident_id: string | null;
  occurred_at: string | null;
  severity: string | null;
  description: string | null;
  created_at: string;
};

/**
 * Driver accident history — cross-linked to safety incident / accident reports.
 * Scoped to one driver inside one operating company; paged for large drivers.
 */
export async function getDriverAccidentHistory(
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string,
  opts: OperationsPagingOpts = {}
): Promise<OperationsResult<AccidentHistoryRow>> {
  const { page, page_size, limit, offset } = resolvePaging(opts);
  const totalRes = await client.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM safety.accident_reports
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<AccidentHistoryRow>(
    `
      SELECT
        id::text AS uuid,
        driver_id::text,
        operating_company_id::text,
        incident_id::text,
        occurred_at::text,
        severity,
        description,
        created_at::text
      FROM safety.accident_reports
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
      ORDER BY occurred_at DESC NULLS LAST, created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
