import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type SafetyEventRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  unit_id: string;
  unit_number: string | null;
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
        he.id::text AS uuid,
        he.driver_id::text,
        he.operating_company_id::text,
        he.unit_id::text,
        NULLIF(TRIM(u.unit_number), '') AS unit_number,
        he.event_kind AS event_type,
        he.severity,
        he.event_at::text AS occurred_at,
        'samsara'::text AS source,
        he.created_at::text
      FROM safety.harsh_events he
      JOIN mdata.units u
        ON u.id = he.unit_id
       AND (u.owner_company_id = $2::uuid OR u.currently_leased_to_company_id = $2::uuid)
      WHERE he.driver_id = $1::uuid
        AND he.operating_company_id = $2::uuid
      ORDER BY he.event_at DESC NULLS LAST, he.created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
