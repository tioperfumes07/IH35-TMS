/**
 * GAP-26 — Customs clearance time analytics.
 */
import type { PoolClient } from "pg";
import { withCurrentUser } from "../../../auth/db.js";

export interface CustomsTimeAvg {
  crossing_point: string;
  direction: string;
  avg_minutes: number;
  sample_count: number;
}

export async function getAverageCustomsTime(
  userUuid: string,
  operatingCompanyId: string,
  crossingPoint: string,
  direction: string,
  lastNDays = 30
): Promise<CustomsTimeAvg | null> {
  return withCurrentUser(userUuid, async (client: PoolClient) => {
    const res = await client.query<CustomsTimeAvg>(
      `SELECT crossing_point, direction,
              ROUND(AVG(customs_clearance_minutes))::integer AS avg_minutes,
              COUNT(*)::integer AS sample_count
       FROM dispatch.border_crossing_events
       WHERE operating_company_id = $1
         AND crossing_point = $2
         AND direction = $3
         AND exited_geofence_at IS NOT NULL
         AND entered_geofence_at >= now() - ($4 * INTERVAL '1 day')
       GROUP BY crossing_point, direction`,
      [operatingCompanyId, crossingPoint, direction, lastNDays]
    );
    return res.rows[0] ?? null;
  });
}

export async function getRecentCrossings(
  userUuid: string,
  operatingCompanyId: string,
  vehicleId: string,
  lastN = 20
): Promise<unknown[]> {
  return withCurrentUser(userUuid, async (client: PoolClient) => {
    const res = await client.query(
      `SELECT uuid, crossing_point, direction, entered_geofence_at, exited_geofence_at,
              customs_clearance_minutes, load_uuid
       FROM dispatch.border_crossing_events
       WHERE operating_company_id = $1 AND vehicle_id = $2
       ORDER BY entered_geofence_at DESC LIMIT $3`,
      [operatingCompanyId, vehicleId, lastN]
    );
    return res.rows;
  });
}

export async function getHistoryForPeriod(
  userUuid: string,
  operatingCompanyId: string,
  from: string,
  to: string,
  vehicleId?: string
): Promise<unknown[]> {
  return withCurrentUser(userUuid, async (client: PoolClient) => {
    const params: unknown[] = [operatingCompanyId, from, to];
    let vehicleFilter = "";
    if (vehicleId) {
      params.push(vehicleId);
      vehicleFilter = `AND vehicle_id = $${params.length}`;
    }
    const res = await client.query(
      `SELECT uuid, vehicle_id, driver_uuid, load_uuid, crossing_point, direction,
              entered_geofence_at, exited_geofence_at, customs_clearance_minutes, created_at
       FROM dispatch.border_crossing_events
       WHERE operating_company_id = $1
         AND entered_geofence_at BETWEEN $2::date AND ($3::date + INTERVAL '1 day')
         ${vehicleFilter}
       ORDER BY entered_geofence_at DESC
       LIMIT 500`,
      params
    );
    return res.rows;
  });
}
