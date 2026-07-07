import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type SafetyEventRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  event_type: string | null;
  severity: string | null;
  occurred_at: string | null;
  source: string;
  created_at: string;
};

/**
 * Driver safety events — DVIR / harsh-brake / speeding signals from Samsara telematics.
 * Scoped to one driver inside one operating company; paged for large drivers.
 *
 * §4 fix (2026-07-06): real columns are `event_kind` / `event_at` (migration 0231) but the
 * frontend's SafetyEventsView column keys were `event_type` / `occurred_at` — aliased. `source` is
 * not a stored column, but `safety.harsh_events` is exclusively populated from Samsara telematics
 * (every row carries a `raw_samsara_id`, per the table's own unique constraint), so the literal
 * 'samsara' is a true statement about this table's provenance, not a fabricated value.
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
        event_kind AS event_type,
        severity,
        event_at::text AS occurred_at,
        'samsara'::text AS source,
        created_at::text
      FROM safety.harsh_events
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
      ORDER BY event_at DESC NULLS LAST, created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
