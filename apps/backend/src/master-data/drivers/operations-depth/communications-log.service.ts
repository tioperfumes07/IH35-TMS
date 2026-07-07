import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type CommunicationsLogRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  channel: string | null;
  body: string | null;
  urgency: string | null;
  direction: string;
  created_at: string;
};

/**
 * Driver communications log — driver profile messages from the comm center (GAP-18).
 * Scoped to one driver inside one operating company; paged for large drivers.
 *
 * §4 fix (2026-07-06): the real message-text column is `message` (migration 0302) but the
 * frontend's CommunicationsLogView column key is `body` — aliased. `direction` is not a stored
 * column: this table (mdata.driver_profile_messages) is exclusively the office→driver comm-center
 * channel (created_by references identity.users staff, delivery_status/read_at added by 0349 track
 * office-to-driver delivery/read receipts; there is no driver-reply column), so `direction` is a
 * literal 'outbound' rather than a fabricated per-row value.
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
        channel,
        message AS body,
        urgency,
        'outbound'::text AS direction,
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
