import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type SafetyEventRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  event_type: string | null;
  severity: string | null;
  occurred_at: string | null;
  source: string | null;
  created_at: string;
};

/**
 * Driver safety events — DVIR / harsh-brake / speeding signals from Samsara telematics.
 * Scoped to one driver inside one operating company; paged for large drivers.
 */
export async function getDriverSafetyEvents(
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string,
  opts: OperationsPagingOpts = {}
): Promise<OperationsResult<SafetyEventRow>> {
  const { page, page_size, limit, offset } = resolvePaging(opts);
  const totalRes = await client.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM safety.harsh_events
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<SafetyEventRow>(
    `
      SELECT
        id::text AS uuid,
        driver_id::text,
        operating_company_id::text,
        event_type,
        severity,
        occurred_at::text,
        source,
        created_at::text
      FROM safety.harsh_events
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
      ORDER BY occurred_at DESC NULLS LAST, created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
