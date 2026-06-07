import {
  geofenceCenterFromVertices,
  transitionState,
  type GpsPosition,
  type TransitionStateResult,
} from "./engine.js";
import { isGeofenceState, validateGeofenceTransition, type GeofenceState } from "./states.js";

type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type ActiveGeofenceVehicle = {
  geofence_id: string;
  vehicle_id: string;
  vertices_json: unknown;
  load_id: string | null;
  stop_id: string | null;
};

export async function fetchActiveGeofences(
  client: QueryClient,
  operatingCompanyId: string
): Promise<ActiveGeofenceVehicle[]> {
  const res = await client.query<ActiveGeofenceVehicle>(
    `
      SELECT
        g.id::text AS geofence_id,
        g.vertices_json,
        NULL::text AS vehicle_id,
        NULL::text AS load_id,
        NULL::text AS stop_id
      FROM geo.geofences g
      WHERE g.operating_company_id = $1::uuid
        AND g.is_active = true
    `,
    [operatingCompanyId]
  );
  return res.rows;
}

export async function processGpsBatch(
  client: QueryClient,
  operatingCompanyId: string,
  positions: Array<{ vehicle_id: string; position: GpsPosition; load_id?: string | null; stop_id?: string | null }>,
  geofences: ActiveGeofenceVehicle[]
): Promise<TransitionStateResult[]> {
  const results: TransitionStateResult[] = [];
  for (const gf of geofences) {
    const center = geofenceCenterFromVertices(gf.vertices_json);
    if (!center) continue;
    for (const pos of positions) {
      try {
        const result = await transitionState(client, {
          operatingCompanyId,
          geofenceId: gf.geofence_id,
          vehicleId: pos.vehicle_id,
          gpsPosition: pos.position,
          geofenceCenter: center,
          loadId: pos.load_id ?? gf.load_id,
          stopId: pos.stop_id ?? gf.stop_id,
          triggerSource: "gps_event",
        });
        if (result.changed) results.push(result);
      } catch {
        // skip illegal transitions
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
  const row = await client.query<{ current_state: string | null; vertices_json: unknown }>(
    `
      SELECT COALESCE(current_state, 'idle') AS current_state, vertices_json
      FROM geo.geofences
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
      FOR UPDATE
    `,
    [input.geofenceId, input.operatingCompanyId]
  );
  const gf = row.rows[0];
  if (!gf) throw new Error("E_GEOFENCE_NOT_FOUND");

  const fromState = gf.current_state ?? "idle";
  if (!isGeofenceState(fromState) || !isGeofenceState(input.toState)) {
    throw new Error("E_INVALID_STATE");
  }
  const validation = validateGeofenceTransition(fromState, input.toState);
  if (validation) throw new Error(`E_ILLEGAL_GEOFENCE_TRANSITION:${fromState}->${input.toState}`);

  const center = geofenceCenterFromVertices(gf.vertices_json);
  if (!center) throw new Error("E_GEOFENCE_CENTER_UNAVAILABLE");

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
  });
}

export async function getGeofenceState(
  client: QueryClient,
  operatingCompanyId: string,
  geofenceId: string
): Promise<{ current_state: GeofenceState; state_updated_at: string | null } | null> {
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
