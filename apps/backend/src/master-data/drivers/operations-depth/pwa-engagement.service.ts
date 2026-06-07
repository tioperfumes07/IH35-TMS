import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type PwaEngagementRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  suggestion_id: string | null;
  response: string | null;
  accepted: boolean | null;
  responded_at: string | null;
  created_at: string;
};

/**
 * Driver PWA engagement — acceptance / response activity for status suggestions,
 * a proxy for login frequency and acceptance rate in the driver PWA.
 * Scoped to one driver inside one operating company; paged for large drivers.
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
      FROM dispatch.auto_status_suggestion_responses
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<PwaEngagementRow>(
    `
      SELECT
        id::text AS uuid,
        driver_id::text,
        operating_company_id::text,
        suggestion_id::text,
        response,
        accepted,
        responded_at::text,
        created_at::text
      FROM dispatch.auto_status_suggestion_responses
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
      ORDER BY responded_at DESC NULLS LAST, created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
