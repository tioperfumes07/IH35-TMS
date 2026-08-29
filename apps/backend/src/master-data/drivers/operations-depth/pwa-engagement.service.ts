import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type PwaEngagementRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  suggestion_id: string | null;
  response: string | null;
  responded_at: string | null;
  accepted: boolean;
  response_by_user_uuid: string | null;
  created_at: string;
};

/**
 * Driver PWA engagement — acceptance / response activity for status suggestions,
 * a proxy for login frequency and acceptance rate in the driver PWA.
 * Scoped to one driver inside one operating company; paged for large drivers.
 *
 * §4 fix (2026-07-06): real column is `response_at` (migration 0230) but the frontend's
 * PwaEngagementView column key is `responded_at` — aliased. `accepted` is not a stored column;
 * `response` is a real CHECK-constrained enum ('confirmed' | 'overridden' | 'dismissed' | 'expired'),
 * so `accepted` is derived honestly as `response = 'confirmed'` rather than fabricated.
 */
export async function getDriverPwaEngagement(
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string,
  opts: OperationsPagingOpts = {}
): Promise<OperationsResult<PwaEngagementRow>> {
  const { page, page_size, limit, offset } = resolvePaging(opts);
  const totalRes = await client.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM dispatch.auto_status_suggestion_responses r
      JOIN dispatch.auto_status_suggestions s
        ON s.id = r.suggestion_id
       AND s.operating_company_id = r.operating_company_id
      WHERE s.driver_id = $1::uuid
        AND r.operating_company_id = $2::uuid
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<PwaEngagementRow>(
    `
      SELECT
        r.id::text AS uuid,
        s.driver_id::text,
        r.operating_company_id::text,
        r.suggestion_id::text,
        r.response,
        r.response_at::text AS responded_at,
        (r.response = 'confirmed') AS accepted,
        r.response_by_user_uuid::text,
        r.response_at::text AS created_at
      FROM dispatch.auto_status_suggestion_responses r
      JOIN dispatch.auto_status_suggestions s
        ON s.id = r.suggestion_id
       AND s.operating_company_id = r.operating_company_id
      WHERE s.driver_id = $1::uuid
        AND r.operating_company_id = $2::uuid
      ORDER BY r.response_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
