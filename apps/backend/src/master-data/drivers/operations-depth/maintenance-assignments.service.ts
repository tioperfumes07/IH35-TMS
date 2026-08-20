import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type MaintenanceAssignmentRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  unit_id: string | null;
  unit_number: string | null;
  assigned_at: string | null;
  unassigned_at: string | null;
  created_at: string;
};

/**
 * Driver maintenance / equipment assignment history — which trucks the driver
 * operated, sourced from telematics vehicle-driver assignments.
 * Scoped to one driver inside one operating company; paged for large drivers.
 *
 * §4 fix (2026-07-06): real columns are `started_at` / `ended_at` (migration 0221) but the
 * frontend's MaintenanceAssignmentsView column keys were `assigned_at` / `unassigned_at` — a name
 * mismatch that silently rendered those two cells "—" (unit_number was already correctly aliased).
 */
export async function getDriverMaintenanceAssignments(
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string,
  opts: OperationsPagingOpts = {}
): Promise<OperationsResult<MaintenanceAssignmentRow>> {
  const { page, page_size, limit, offset } = resolvePaging(opts);
  const totalRes = await client.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM telematics.vehicle_driver_assignments
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<MaintenanceAssignmentRow>(
    `
      SELECT
        a.id::text AS uuid,
        a.driver_id::text,
        a.operating_company_id::text,
        a.unit_id::text,
        NULLIF(TRIM(u.unit_number), '') AS unit_number,
        a.started_at::text AS assigned_at,
        a.ended_at::text AS unassigned_at,
        a.created_at::text
      FROM telematics.vehicle_driver_assignments a
      LEFT JOIN mdata.units u ON u.id = a.unit_id
                              AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $2::uuid
      WHERE a.driver_id = $1::uuid
        AND a.operating_company_id = $2::uuid
      ORDER BY a.started_at DESC NULLS LAST, a.created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
