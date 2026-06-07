import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type PermitHistoryRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  permit_type: string | null;
  issuing_state: string | null;
  permit_number: string | null;
  expiration_date: string | null;
  created_at: string;
};

/**
 * Driver permit history — CDL / medical / state permits and their expiry dates.
 * Scoped to one driver inside one operating company; paged for large drivers.
 */
export async function getDriverPermitHistory(
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string,
  opts: OperationsPagingOpts = {}
): Promise<OperationsResult<PermitHistoryRow>> {
  const { page, page_size, limit, offset } = resolvePaging(opts);
  const totalRes = await client.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM safety.permits
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<PermitHistoryRow>(
    `
      SELECT
        id::text AS uuid,
        driver_id::text,
        operating_company_id::text,
        permit_type,
        issuing_state,
        permit_number,
        expiration_date::text,
        created_at::text
      FROM safety.permits
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
      ORDER BY expiration_date DESC NULLS LAST, created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
