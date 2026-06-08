/**
 * GAP-25 — Active Driver Set Recompute Service
 *
 * Computes the active driver set for an operating company by finding drivers
 * with recorded activity (last_seen_at or webhook events) within `threshold_days`.
 *
 * Writes a snapshot row to integrations.active_driver_set_cache and prunes
 * snapshots beyond the 30-row retention window per OCI.
 */

import type { PoolClient } from "pg";

export const MAX_SNAPSHOTS_PER_OCI = 30;
export const DEFAULT_THRESHOLD_DAYS = 7;

export interface ActiveDriverSetSnapshot {
  uuid: string;
  operating_company_id: string;
  snapshot_at: string;
  threshold_days: number;
  active_driver_uuids: string[];
  total_driver_count: number;
}

/**
 * Queries samsara_drivers and samsara_webhook_events to find drivers active
 * within the last `threshold_days` days, writes a new cache snapshot, and
 * prunes old snapshots beyond MAX_SNAPSHOTS_PER_OCI.
 */
export async function recomputeActiveDriverSet(
  client: PoolClient,
  operating_company_id: string,
  threshold_days: number = DEFAULT_THRESHOLD_DAYS
): Promise<ActiveDriverSetSnapshot> {
  await client.query(
    `SELECT set_config('app.operating_company_id', $1, true)`,
    [operating_company_id]
  );

  const cutoff = new Date(Date.now() - threshold_days * 24 * 60 * 60 * 1000).toISOString();

  // Active drivers: seen directly OR referenced in a recent webhook event
  const activeRes = await client.query<{ local_driver_id: string; total: string }>(
    `
      SELECT
        d.local_driver_id::text,
        COUNT(*) OVER () AS total
      FROM integrations.samsara_drivers d
      WHERE d.operating_company_id = $1::uuid
        AND d.local_driver_id IS NOT NULL
        AND (
          d.last_seen_at >= $2::timestamptz
          OR EXISTS (
            SELECT 1
            FROM integrations.samsara_webhook_events e
            WHERE e.operating_company_id = $1::uuid
              AND e.received_at >= $2::timestamptz
              AND (e.payload -> 'driver' ->> 'id') = d.samsara_driver_id
          )
        )
      ORDER BY d.local_driver_id
    `,
    [operating_company_id, cutoff]
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
