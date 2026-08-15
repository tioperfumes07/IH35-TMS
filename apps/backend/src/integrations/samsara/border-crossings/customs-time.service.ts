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
       WHERE operating_company_id = $1::uuid
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
       WHERE operating_company_id = $1::uuid AND vehicle_id = $2
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
      vehicleFilter = `AND e.vehicle_id = $${params.length}`;
    }
    const res = await client.query(
      `SELECT e.uuid, e.vehicle_id, e.driver_uuid, e.load_uuid,
              NULLIF(trim(concat_ws(' ', d.first_name, d.last_name)), '') AS driver_name,
              l.load_number,
              e.crossing_point, e.direction, e.entered_geofence_at, e.exited_geofence_at,
              e.customs_clearance_minutes, e.created_at
       FROM dispatch.border_crossing_events e
       LEFT JOIN mdata.drivers d
         ON d.id = e.driver_uuid AND d.operating_company_id = e.operating_company_id
       LEFT JOIN mdata.loads l
         ON l.id = e.load_uuid AND l.operating_company_id = e.operating_company_id
       WHERE e.operating_company_id = $1::uuid
         AND e.entered_geofence_at BETWEEN $2::date AND ($3::date + INTERVAL '1 day')
         ${vehicleFilter}
       ORDER BY e.entered_geofence_at DESC
       LIMIT 500`,
      params
    );
    return res.rows;
  });
}
