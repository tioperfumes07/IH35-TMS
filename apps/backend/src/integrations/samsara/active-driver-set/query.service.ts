/**
 * GAP-25 — Active Driver Set Query Service
 *
 * Returns the latest cached active-driver-set snapshot for an OCI.
 * Falls back to synchronous recompute when the cache is stale.
 */

import type { PoolClient } from "pg";
import { recomputeActiveDriverSet, type ActiveDriverSetSnapshot } from "./recompute.service.js";

export const DEFAULT_MAX_AGE_MINUTES = 15;

export interface ActiveDriversResult {
  active_driver_uuids: string[];
  total_driver_count: number;
  snapshot_at: string;
  threshold_days: number;
  cache_hit: boolean;
}

/**
 * Returns the latest snapshot if it is fresher than `max_age_minutes`.
 * Falls back to recompute (synchronous) when stale or absent.
 */
export async function getActiveDrivers(
  client: PoolClient,
  operating_company_id: string,
  threshold_days: number = 7,
  max_age_minutes: number = DEFAULT_MAX_AGE_MINUTES
): Promise<ActiveDriversResult> {
  await client.query(
    `SELECT set_config('app.operating_company_id', $1, true)`,
    [operating_company_id]
  );

  const cutoff = new Date(Date.now() - max_age_minutes * 60 * 1000).toISOString();

  const latestRes = await client.query<ActiveDriverSetSnapshot>(
    `
      SELECT
        uuid::text,
        operating_company_id::text,
        snapshot_at,
        threshold_days,
        active_driver_uuids::text[] AS active_driver_uuids,
        total_driver_count
      FROM integrations.active_driver_set_cache
      WHERE operating_company_id = $1::uuid
        AND threshold_days = $2
        AND snapshot_at >= $3::timestamptz
      ORDER BY snapshot_at DESC
      LIMIT 1
    `,
    [operating_company_id, threshold_days, cutoff]
  );

  if (latestRes.rows.length > 0) {
    const row = latestRes.rows[0];
    return {
      active_driver_uuids: row.active_driver_uuids,
      total_driver_count: row.total_driver_count,
      snapshot_at: String(row.snapshot_at),
      threshold_days: row.threshold_days,
      cache_hit: true,
    };
  }

  // Stale or absent — recompute synchronously
  const snapshot = await recomputeActiveDriverSet(client, operating_company_id, threshold_days);
  return {
    active_driver_uuids: snapshot.active_driver_uuids,
    total_driver_count: snapshot.total_driver_count,
    snapshot_at: String(snapshot.snapshot_at),
    threshold_days: snapshot.threshold_days,
    cache_hit: false,
  };
}
