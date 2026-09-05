/**
 * GAP-25 — Active Driver Set Recompute Service
 *
 * Computes the active driver set for an operating carrier from the physical
 * fleet it currently leases: a live vehicle position plus an overlapping
 * vehicle-driver assignment. Integration mirror freshness is not movement.
 *
 * Writes a snapshot row to integrations.active_driver_set_cache and prunes
 * snapshots beyond the 30-row retention window per OCI.
 */

import type { PoolClient } from "pg";

export const MAX_SNAPSHOTS_PER_OCI = 30;
export const DEFAULT_THRESHOLD_DAYS = 15;

export interface ActiveDriverSetSnapshot {
  uuid: string;
  operating_company_id: string;
  snapshot_at: string;
  threshold_days: number;
  active_driver_uuids: string[];
  total_driver_count: number;
}

/**
 * Queries canonical assignment and latest-position telemetry for drivers active
 * within the last `threshold_days` days, writes a new cache snapshot, and prunes
 * old snapshots beyond MAX_SNAPSHOTS_PER_OCI.
 */
export async function recomputeActiveDriverSet(
  client: PoolClient,
  operating_company_id: string,
  threshold_days: number = DEFAULT_THRESHOLD_DAYS
): Promise<ActiveDriverSetSnapshot> {
  await client.query(
    `SELECT set_config('app.operating_company_id', $1::text, true)`,
    [operating_company_id]
  );

  // Rule 49: the Samsara mirror's last_seen_at is a dead integration heartbeat,
  // not evidence that a driver moved. Resolve activity from the latest physical
  // position and the assignment window, and scope the truck by its current lease.
  const activeRes = await client.query<{ local_driver_id: string; total: string }>(
    `
      SELECT DISTINCT
        d.id::text AS local_driver_id,
        COUNT(*) OVER () AS total
      FROM telematics.vehicle_driver_assignments a
      JOIN telematics.vehicle_latest_position p
        ON p.unit_id = a.unit_id
      JOIN mdata.units u
        ON u.id = a.unit_id
       AND u.currently_leased_to_company_id = $1::uuid
       AND u.status = 'InService'
       AND u.is_sample_data IS NOT TRUE
       AND u.deactivated_at IS NULL
       AND u.sold_date IS NULL
       AND u.disposed_date IS NULL
       AND u.is_oos IS NOT TRUE
      JOIN mdata.drivers d
        ON d.id = a.driver_id
       AND d.is_sample_data IS NOT TRUE
       AND d.deactivated_at IS NULL
       AND d.status IS DISTINCT FROM 'Terminated'::mdata.driver_status
      WHERE p.captured_at >= now() - ($2::int * interval '1 day')
        AND a.started_at <= now()
        AND (a.ended_at IS NULL OR a.ended_at >= now() - ($2::int * interval '1 day'))
      ORDER BY d.id::text
    `,
    [operating_company_id, threshold_days]
  );

  const totalDriverRes = await client.query<{ total: string }>(
    `
      SELECT COUNT(*) AS total
      FROM integrations.samsara_drivers
      WHERE operating_company_id = $1::uuid
    `,
    [operating_company_id]
  );

  const active_driver_uuids = activeRes.rows.map((r) => r.local_driver_id);
  const total_driver_count = Number(totalDriverRes.rows[0]?.total ?? 0);

  // Insert new snapshot
  const insertRes = await client.query<ActiveDriverSetSnapshot>(
    `
      INSERT INTO integrations.active_driver_set_cache
        (operating_company_id, threshold_days, active_driver_uuids, total_driver_count)
      VALUES ($1::uuid, $2, $3::uuid[], $4)
      RETURNING
        uuid::text,
        operating_company_id::text,
        snapshot_at,
        threshold_days,
        active_driver_uuids::text[] AS active_driver_uuids,
        total_driver_count
    `,
    [operating_company_id, threshold_days, active_driver_uuids, total_driver_count]
  );

  const snapshot = insertRes.rows[0];

  // Prune snapshots beyond retention window
  await client.query(
    `
      DELETE FROM integrations.active_driver_set_cache
      WHERE operating_company_id = $1::uuid
        AND threshold_days = $2
        AND uuid NOT IN (
          SELECT uuid
          FROM integrations.active_driver_set_cache
          WHERE operating_company_id = $1::uuid
            AND threshold_days = $2
          ORDER BY snapshot_at DESC
          LIMIT $3
        )
    `,
    [operating_company_id, threshold_days, MAX_SNAPSHOTS_PER_OCI]
  );

  return snapshot;
}
