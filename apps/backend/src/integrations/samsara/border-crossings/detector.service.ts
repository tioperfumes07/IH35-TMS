/**
 * GAP-26 — Border crossing detection service.
 * Detects when vehicles enter/exit 1000m geofences at Laredo border bridges.
 */
import type { PoolClient } from "pg";

export interface BorderGeofence {
  id: string;
  name: string;
  crossingPoint: "laredo-i" | "laredo-ii" | "laredo-iii" | "laredo-iv" | "colombia" | "other";
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
}

// 1000m radius geofences for Laredo-area border bridges
export const BORDER_GEOFENCES: BorderGeofence[] = [
  { id: "laredo-bridge-i",   name: "Laredo Bridge I (Gateway to the Americas)",  crossingPoint: "laredo-i",   centerLat: 27.4934, centerLng: -99.5117, radiusMeters: 1000 },
  { id: "laredo-bridge-ii",  name: "Laredo Bridge II (Juarez-Lincoln)",           crossingPoint: "laredo-ii",  centerLat: 27.5037, centerLng: -99.5027, radiusMeters: 1000 },
  { id: "laredo-bridge-iii", name: "Laredo Bridge III (World Trade Bridge)",      crossingPoint: "laredo-iii", centerLat: 27.5640, centerLng: -99.4697, radiusMeters: 1000 },
  { id: "laredo-bridge-iv",  name: "Laredo Bridge IV (Colombia Solidarity)",      crossingPoint: "laredo-iv",  centerLat: 27.9022, centerLng: -99.5340, radiusMeters: 1000 },
  { id: "colombia-bridge",   name: "Colombia-Solidarity International Bridge",    crossingPoint: "colombia",   centerLat: 27.9022, centerLng: -99.5340, radiusMeters: 1000 },
];

function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findGeofenceForPosition(lat: number, lng: number): BorderGeofence | null {
  for (const gf of BORDER_GEOFENCES) {
    const dist = haversineDistanceMeters(lat, lng, gf.centerLat, gf.centerLng);
    if (dist <= gf.radiusMeters) return gf;
  }
  return null;
}

export async function detectCrossings(
  client: PoolClient,
  events: Array<{
    /** mdata.units(id) — canonical unit identifier from integrations.samsara_vehicle_positions.unit_uuid */
    unit_uuid: string;
    operating_company_id: string;
    lat: number;
    lng: number;
    direction: "northbound" | "southbound";
    recorded_at: string;
  }>
): Promise<number> {
  let inserted = 0;
  for (const ev of events) {
    const gf = findGeofenceForPosition(ev.lat, ev.lng);
    if (!gf) continue;

    // dispatch.border_crossing_events.vehicle_id is a TEXT stable identifier; we key it on the unit UUID.
    const vehicleId = ev.unit_uuid;

    // Check if there's an open entry for this vehicle at this crossing
    const existing = await client.query<{ uuid: string }>(
      `SELECT uuid FROM dispatch.border_crossing_events
       WHERE vehicle_id = $1 AND crossing_point = $2 AND exited_geofence_at IS NULL
       ORDER BY entered_geofence_at DESC LIMIT 1`,
      [vehicleId, gf.crossingPoint]
    );

    if (existing.rows.length === 0) {
      // New entry — resolve the active load for this unit (canonical: mdata.loads.assigned_unit_id).
      const activeLoad = await client.query<{ id: string }>(
        `SELECT l.id FROM mdata.loads l
         WHERE l.assigned_unit_id = $1::uuid
           AND l.status IN ('assigned','in_transit')
           AND l.operating_company_id = $2::uuid
           AND l.soft_deleted_at IS NULL
         ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC
         LIMIT 1`,
        [ev.unit_uuid, ev.operating_company_id]
      );
      await client.query(
        `INSERT INTO dispatch.border_crossing_events
           (operating_company_id, vehicle_id, crossing_point, direction, entered_geofence_at, load_uuid)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [ev.operating_company_id, vehicleId, gf.crossingPoint, ev.direction, ev.recorded_at, activeLoad.rows[0]?.id ?? null]
      );
      inserted++;
    } else {
      // Mark exit
      await client.query(
        `UPDATE dispatch.border_crossing_events SET exited_geofence_at = $1 WHERE uuid = $2`,
        [ev.recorded_at, existing.rows[0].uuid]
      );
    }
  }
  return inserted;
}
