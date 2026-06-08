import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type CommunicationsLogRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  direction: string | null;
  channel: string | null;
  body: string | null;
  created_at: string;
};

/**
 * Driver communications log — driver profile messages from the comm center (GAP-18).
 * Scoped to one driver inside one operating company; paged for large drivers.
 */
export async function getDriverCommunicationsLog(
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string,
  opts: OperationsPagingOpts = {}
): Promise<OperationsResult<CommunicationsLogRow>> {
  const { page, page_size, limit, offset } = resolvePaging(opts);
  const totalRes = await client.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM mdata.driver_profile_messages
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<CommunicationsLogRow>(
    `
      SELECT
        id::text AS uuid,
        driver_id::text,
        operating_company_id::text,
        direction,
        channel,
        body,
        created_at::text
      FROM mdata.driver_profile_messages
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
