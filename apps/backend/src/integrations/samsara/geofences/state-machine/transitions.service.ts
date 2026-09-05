import {
  geofenceCenterFromVertices,
  geofenceVehicleStateTableExists,
  transitionState,
  type GpsPosition,
  type TransitionStateResult,
} from "./engine.js";
import { isGeofenceState, type GeofenceState } from "./states.js";

type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type ActiveGeofenceVehicle = {
  geofence_id: string;
  vertices_json: unknown;
  center_lat: number | null;
  center_lng: number | null;
  approach_radius_m: number | null;
  radius_m: number | null;
};

let cachedHasCenterColumns: boolean | null = null;

/** GAP-39 migration #4 (drafted, not applied) adds center_lat/center_lng/radius_m/
    approach_radius_m to geo.geofences. Checked once per process and cached — these columns
    either exist or they don't for the life of a deploy. Until they land, fetchActiveGeofences
    falls back to computing center from vertices_json in application code (correct, just without
    the SQL-side bounding-box prefilter this enables once the columns exist). */
async function hasGeofenceCenterColumns(client: QueryClient): Promise<boolean> {
  if (cachedHasCenterColumns != null) return cachedHasCenterColumns;
  const res = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'geo' AND table_name = 'geofences' AND column_name = 'center_lat'
      ) AS exists
    `
  );
  cachedHasCenterColumns = Boolean(res.rows[0]?.exists);
  return cachedHasCenterColumns;
}

export async function fetchActiveGeofences(
  client: QueryClient,
  operatingCompanyId: string
): Promise<ActiveGeofenceVehicle[]> {
  const hasCenterColumns = await hasGeofenceCenterColumns(client);
  if (hasCenterColumns) {
    const res = await client.query<ActiveGeofenceVehicle>(
      `
        SELECT
          g.id::text AS geofence_id,
          g.vertices_json,
          g.center_lat::double precision AS center_lat,
          g.center_lng::double precision AS center_lng,
          g.approach_radius_m,
          g.radius_m
        FROM geo.geofences g
        WHERE g.operating_company_id = $1::uuid
          AND g.is_active = true
      `,
      [operatingCompanyId]
    );
    return res.rows;
  }
  // Fallback (pre-migration #4): no center columns yet — vertices_json is the only source of
  // truth for center, computed in application code (geofenceCenterFromVertices).
  const res = await client.query<{ geofence_id: string; vertices_json: unknown }>(
    `
      SELECT g.id::text AS geofence_id, g.vertices_json
      FROM geo.geofences g
      WHERE g.operating_company_id = $1::uuid
        AND g.is_active = true
    `,
    [operatingCompanyId]
  );
  return res.rows.map((row) => ({
    geofence_id: row.geofence_id,
    vertices_json: row.vertices_json,
    center_lat: null,
    center_lng: null,
    approach_radius_m: null,
    radius_m: null,
  }));
}

const METERS_PER_DEGREE_LAT = 111_320;

/** Bounding-box prefilter (GAP-39 §3.3): with 604+ Loves fences alone, computing a real haversine
    for every geofence x every vehicle every tick is O(fences x vehicles) — this trims to only
    the geofences whose approach ring could plausibly contain the position, using cheap degree-
    box math before any haversine call. A geofence with no known center (pre-migration #4, or a
    center that failed to derive from vertices) is never excluded by this filter — it falls
    through to the real per-pair haversine check in processGpsBatch instead of being silently
    dropped. */
function withinBoundingBox(
  position: GpsPosition,
  center: { lat: number; lng: number },
  radiusMeters: number
): boolean {
  const latDelta = radiusMeters / METERS_PER_DEGREE_LAT;
  const lngDelta = radiusMeters / (METERS_PER_DEGREE_LAT * Math.max(0.1, Math.cos((center.lat * Math.PI) / 180)));
  return (
    Math.abs(position.lat - center.lat) <= latDelta &&
    Math.abs(position.lng - center.lng) <= lngDelta
  );
}

export async function processGpsBatch(
  client: QueryClient,
  operatingCompanyId: string,
  positions: Array<{ vehicle_id: string; position: GpsPosition; speed_mph?: number | null; odometer_mi?: number | null; load_id?: string | null; stop_id?: string | null }>,
  geofences: ActiveGeofenceVehicle[]
): Promise<TransitionStateResult[]> {
  const results: TransitionStateResult[] = [];
  for (const gf of geofences) {
    const center =
      gf.center_lat != null && gf.center_lng != null
        ? { lat: gf.center_lat, lng: gf.center_lng }
        : geofenceCenterFromVertices(gf.vertices_json);
    if (!center) continue;

    // Prefilter radius is the widest ring this geofence could plausibly need to react to
    // (approach if known, else a generous default so a not-yet-migrated row is never
    // under-filtered into missing a real transition).
    const prefilterRadiusM = gf.approach_radius_m ?? 8047;

    for (const pos of positions) {
      if (!withinBoundingBox(pos.position, center, prefilterRadiusM)) continue;
      try {
        const result = await transitionState(client, {
          operatingCompanyId,
          geofenceId: gf.geofence_id,
          vehicleId: pos.vehicle_id,
          gpsPosition: pos.position,
          geofenceCenter: center,
          speedMph: pos.speed_mph ?? null,
          odometerMi: pos.odometer_mi ?? null,
          radii: {
            approachRadiusM: gf.approach_radius_m ?? undefined,
            arriveRadiusM: gf.radius_m ?? undefined,
          },
          loadId: pos.load_id ?? null,
          stopId: pos.stop_id ?? null,
          triggerSource: "gps_event",
        });
        if ("changed" in result && result.changed) results.push(result);
      } catch (err) {
        // GAP-39 (2026-09-05): a silent catch{} here is against owner law — illegal transitions
        // must be visible, not swallowed. transitionState() already warns once on its own before
        // throwing; this is the second, batch-level log carrying the loop's own context.
        console.warn("[geofence-transitions] illegal transition skipped in batch", {
          geofence_id: gf.geofence_id,
          unit_id: pos.vehicle_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return results;
}

export async function manualTransition(
  client: QueryClient,
  input: {
    operatingCompanyId: string;
    geofenceId: string;
    vehicleId: string;
    toState: GeofenceState;
    actorUserId: string;
    gpsPosition: GpsPosition;
    loadId?: string | null;
    stopId?: string | null;
  }
): Promise<TransitionStateResult> {
  const row = await client.query<{ vertices_json: unknown }>(
    `
      SELECT vertices_json
      FROM geo.geofences
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [input.geofenceId, input.operatingCompanyId]
  );
  const gf = row.rows[0];
  if (!gf) throw new Error("E_GEOFENCE_NOT_FOUND");

  const center = geofenceCenterFromVertices(gf.vertices_json);
  if (!center) throw new Error("E_GEOFENCE_CENTER_UNAVAILABLE");

  // Manual override always targets the intended state directly, independent of the geometric
  // proposal — validated against the same state graph so an operator cannot force an illegal edge.
  return transitionState(client, {
    operatingCompanyId: input.operatingCompanyId,
    geofenceId: input.geofenceId,
    vehicleId: input.vehicleId,
    gpsPosition: input.gpsPosition,
    geofenceCenter: center,
    loadId: input.loadId,
    stopId: input.stopId,
    triggerSource: "manual",
    actorUserId: input.actorUserId,
    forceToState: input.toState,
  }).then((result) => {
    if ("skipped" in result) throw new Error("E_GEOFENCE_VEHICLE_STATE_TABLE_MISSING");
    return result;
  });
}

export async function getGeofenceState(
  client: QueryClient,
  operatingCompanyId: string,
  geofenceId: string,
  unitId?: string
): Promise<{ current_state: GeofenceState; state_updated_at: string | null } | null> {
  if (unitId) {
    // Reuses the single source of truth (engine.ts) for this check — it already declares intent
    // (warns "unavailable") on the false branch, rather than duplicating an undeclared probe here.
    const perVehicleExists = await geofenceVehicleStateTableExists(client);
    if (perVehicleExists) {
      const res = await client.query<{ current_state: string | null; state_updated_at: string | null }>(
        `
          SELECT current_state, state_updated_at::text
          FROM geo.geofence_vehicle_state
          WHERE operating_company_id = $1::uuid AND geofence_id = $2::uuid AND unit_id = $3::uuid
          LIMIT 1
        `,
        [operatingCompanyId, geofenceId, unitId]
      );
      const row = res.rows[0];
      if (row) {
        const state = row.current_state && isGeofenceState(row.current_state) ? row.current_state : "idle";
        return { current_state: state, state_updated_at: row.state_updated_at };
      }
      return { current_state: "idle", state_updated_at: null };
    }
  }
  // Legacy read (no unit specified, or migration #4 not yet applied) — the deprecated shared
  // column, kept readable per append-only law even after writes to it stop.
  const res = await client.query<{ current_state: string | null; state_updated_at: string | null }>(
    `
      SELECT current_state, state_updated_at::text
      FROM geo.geofences
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [geofenceId, operatingCompanyId]
  );
  const row = res.rows[0];
  if (!row) return null;
  const state = row.current_state && isGeofenceState(row.current_state) ? row.current_state : "idle";
  return { current_state: state, state_updated_at: row.state_updated_at };
}

export async function listTransitions(
  client: QueryClient,
  operatingCompanyId: string,
  geofenceId: string,
  limit: number
): Promise<Array<Record<string, unknown>>> {
  const res = await client.query(
    `
      SELECT
        id::text,
        vehicle_id::text,
        load_id::text,
        stop_id::text,
        from_state,
        to_state,
        transitioned_at::text,
        trigger_source
      FROM geo.geofence_state_transitions
      WHERE geofence_id = $1::uuid
        AND operating_company_id = $2::uuid
      ORDER BY transitioned_at DESC
      LIMIT $3
    `,
    [geofenceId, operatingCompanyId, limit]
  );
  return res.rows;
}

/** Test-only hook to reset the module-level column-existence cache between test cases. */
export function __resetCenterColumnsCacheForTests() {
  cachedHasCenterColumns = null;
}
