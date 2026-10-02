/**
 * GAP-39 — Bind load stops to geofences for state-machine traceability (CAP-2).
 *
 * E-25 (Lead, 2026-10-01): geometry moved to load-stop-geofence-geometry.ts — a precision-sized
 * circle instead of a 250 ft diamond; low-precision stops are reported as skipped, never fenced
 * at a city centroid. Re-binding is now idempotent on coordinates: a fence whose center moved
 * (stop re-geocoded) is refreshed, an unchanged one is left alone. Called at booking, at
 * replace-stops, and by the E-25 sync cron for every board-active load (the booking call ran
 * before geocoding and therefore bound nothing — measured: 0 load-stop fences ever, any company).
 */
import { circlePolygon, loadStopFenceLabel, loadStopFenceRadiusMeters } from "./load-stop-geofence-geometry.js";

type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type LoadStop = {
  stop_id: string;
  lat: number;
  lng: number;
  sequence: number;
  geocode_precision: string | null;
};

export type BindLoadToGeofencesResult = {
  bound: number;
  geofence_ids: string[];
  created: number;
  refreshed: number;
  unchanged: number;
  skipped_low_precision: Array<{ stop_id: string; sequence: number; geocode_precision: string | null }>;
};

export async function bindLoadToGeofences(
  client: QueryClient,
  operatingCompanyId: string,
  loadId: string
): Promise<BindLoadToGeofencesResult> {
  const stops = await client.query<LoadStop>(
    `
      SELECT
        ls.id::text AS stop_id,
        ls.latitude::double precision AS lat,
        ls.longitude::double precision AS lng,
        ls.sequence_number AS sequence,
        ls.geocode_precision
      FROM mdata.load_stops ls
      JOIN mdata.loads l ON l.id = ls.load_id
      WHERE l.id = $1::uuid
        AND l.operating_company_id = $2::uuid
        AND ls.soft_deleted_at IS NULL
        AND ls.latitude IS NOT NULL
        AND ls.longitude IS NOT NULL
      ORDER BY ls.sequence_number
    `,
    [loadId, operatingCompanyId]
  );

  const result: BindLoadToGeofencesResult = {
    bound: 0, geofence_ids: [], created: 0, refreshed: 0, unchanged: 0, skipped_low_precision: [],
  };

  for (const stop of stops.rows) {
    const radius = loadStopFenceRadiusMeters(stop.geocode_precision);
    if (radius === null) {
      result.skipped_low_precision.push({ stop_id: stop.stop_id, sequence: stop.sequence, geocode_precision: stop.geocode_precision });
      continue;
    }
    const vertices = circlePolygon(stop.lat, stop.lng, radius);
    const label = loadStopFenceLabel(loadId, stop.sequence);
    // Serialise binds of the same stop fence: two concurrent binds (auto_dispatch) each saw "no fence" and inserted
    // one -- 24 stop labels carry two fences live. The lock is per company + label and released at commit.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`, [operatingCompanyId, label]);
    const existing = await client.query<{ id: string; center_lat: string | null; center_lng: string | null; radius_m: number | null }>(
      `
        SELECT id::text, center_lat::text, center_lng::text, radius_m
        FROM geo.geofences
        WHERE operating_company_id = $1::uuid
          AND location_kind = 'customer_site'
          AND is_active = true
          AND location_ref_id IS NULL
          AND label = $2
        LIMIT 1
      `,
      [operatingCompanyId, label]
    );
    if (existing.rows[0]?.id) {
      const row = existing.rows[0];
      const sameCenter =
        row.center_lat !== null && row.center_lng !== null && row.radius_m === radius &&
        Math.abs(Number(row.center_lat) - stop.lat) < 1e-7 && Math.abs(Number(row.center_lng) - stop.lng) < 1e-7;
      if (sameCenter) {
        result.unchanged += 1;
        result.geofence_ids.push(row.id);
        result.bound += 1;
        continue;
      }
      const refreshed = await client.query<{ id: string }>(
        `UPDATE geo.geofences
            SET vertices_json = $3::jsonb, center_lat = $4, center_lng = $5, radius_m = $6, updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND is_active = true
          RETURNING id::text`,
        [row.id, operatingCompanyId, JSON.stringify(vertices), stop.lat, stop.lng, radius]
      );
      if (!refreshed.rows[0]?.id) throw new Error("load_geofence_refresh_failed");
      result.refreshed += 1;
      result.geofence_ids.push(refreshed.rows[0].id);
      result.bound += 1;
      continue;
    }

    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO geo.geofences (
          operating_company_id, label, location_kind, vertices_json, is_active, source, center_lat, center_lng, radius_m
        )
        VALUES ($1::uuid, $2, 'customer_site', $3::jsonb, true, 'auto_dispatch', $4, $5, $6)
        RETURNING id::text
      `,
      [operatingCompanyId, label, JSON.stringify(vertices), stop.lat, stop.lng, radius]
    );
    if (!inserted.rows[0]?.id) throw new Error("load_geofence_insert_failed");
    result.created += 1;
    result.geofence_ids.push(inserted.rows[0].id);
    result.bound += 1;
  }

  return result;
}
