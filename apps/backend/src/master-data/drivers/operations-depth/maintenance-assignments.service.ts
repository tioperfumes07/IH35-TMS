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
        COALESCE(NULLIF(TRIM(u.unit_number), ''), a.unit_id::text) AS unit_number,
        a.assigned_at::text,
        a.unassigned_at::text,
        a.created_at::text
      FROM telematics.vehicle_driver_assignments a
      LEFT JOIN mdata.units u ON u.id = a.unit_id
      WHERE a.driver_id = $1::uuid
        AND a.operating_company_id = $2::uuid
      ORDER BY a.assigned_at DESC NULLS LAST, a.created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
