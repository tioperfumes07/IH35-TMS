/**
 * Owner law 2026-08-08: Active drivers = operational activity in the last 30 days.
 * Everyone else stays Inactive (Terminated is never touched).
 *
 * Activity signals (any one is enough):
 *  - assigned primary/secondary on a non-deleted load with COALESCE(updated_at, created_at) in window
 *  - telematics.vehicle_driver_assignments last drive (or open assignment) in window
 *  - hire_date within 30 calendar days OR created_at within 30 days (new-hire grace)
 *
 * Mass write sets status + deactivated_at only — does NOT deactivate identity.users
 * (roster Inactive ≠ lock out of PWA). Manual /reactivate remains the operator path.
 */
import type { PoolClient } from "pg";

export const DRIVER_ACTIVE_THRESHOLD_DAYS = 30;

const ACTIVITY_PREDICATE = `
  (
    EXISTS (
      SELECT 1
        FROM mdata.loads l
       WHERE l.soft_deleted_at IS NULL
         AND (
           l.operating_company_id = d.operating_company_id
           OR EXISTS (
             SELECT 1 FROM mdata.driver_company_authorizations load_activity_dca
             WHERE load_activity_dca.driver_id = d.id
               AND load_activity_dca.company_id = l.operating_company_id
               AND load_activity_dca.is_authorized = true
               AND load_activity_dca.deactivated_at IS NULL
           )
         )
         AND (l.assigned_primary_driver_id = d.id OR l.assigned_secondary_driver_id = d.id)
         AND COALESCE(l.updated_at, l.created_at) >= now() - ($1 || ' days')::interval
    )
    OR EXISTS (
      SELECT 1
        FROM telematics.vehicle_driver_assignments a
       WHERE a.driver_id = d.id
         AND (
           a.operating_company_id = d.operating_company_id
           OR EXISTS (
             SELECT 1 FROM mdata.driver_company_authorizations telematics_activity_dca
             WHERE telematics_activity_dca.driver_id = d.id
               AND telematics_activity_dca.company_id = a.operating_company_id
               AND telematics_activity_dca.is_authorized = true
               AND telematics_activity_dca.deactivated_at IS NULL
           )
         )
         AND (
           a.ended_at IS NULL
           OR COALESCE(a.ended_at, a.started_at) >= now() - ($1 || ' days')::interval
         )
    )
    OR (d.hire_date IS NOT NULL AND d.hire_date >= CURRENT_DATE - ($1::int))
    OR d.created_at >= now() - ($1 || ' days')::interval
  )
`;

export type DriverActive30dApplyResult = {
  threshold_days: number;
  deactivated: number;
  reactivated: number;
};

/**
 * Apply the 30-day activity rule for one operating company (or all when operatingCompanyId is null).
 * Idempotent. Never mutates Terminated rows.
 */
export async function applyDriverActive30dRule(
  client: PoolClient,
  operatingCompanyId: string | null = null
): Promise<DriverActive30dApplyResult> {
  const days = DRIVER_ACTIVE_THRESHOLD_DAYS;

  const deactivate = await client.query(
    `
      UPDATE mdata.drivers d
         SET status = 'Inactive'::mdata.driver_status,
             deactivated_at = COALESCE(d.deactivated_at, now()),
             updated_at = now()
       WHERE d.archived_at IS NULL
         AND d.status IS DISTINCT FROM 'Terminated'::mdata.driver_status
         AND d.status IS DISTINCT FROM 'Inactive'::mdata.driver_status
         AND d.deactivated_at IS NULL
         AND ($2::uuid IS NULL OR d.operating_company_id = $2::uuid)
         AND NOT ${ACTIVITY_PREDICATE}
      RETURNING d.id
    `,
    [String(days), operatingCompanyId]
  );

  const reactivate = await client.query(
    `
      UPDATE mdata.drivers d
         SET status = 'Active'::mdata.driver_status,
             deactivated_at = NULL,
             updated_at = now()
       WHERE d.archived_at IS NULL
         AND d.status = 'Inactive'::mdata.driver_status
         AND d.deactivated_at IS NOT NULL
         AND ($2::uuid IS NULL OR d.operating_company_id = $2::uuid)
         AND ${ACTIVITY_PREDICATE}
      RETURNING d.id
    `,
    [String(days), operatingCompanyId]
  );

  return {
    threshold_days: days,
    deactivated: deactivate.rowCount ?? 0,
    reactivated: reactivate.rowCount ?? 0,
  };
}
