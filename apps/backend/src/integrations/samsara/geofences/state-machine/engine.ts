import { appendCrudAudit } from "../../../../audit/crud-audit.js";
import {
  APPROACHING_RADIUS_M,
  DEPARTING_RADIUS_M,
  type GeofenceState,
  isGeofenceState,
  validateGeofenceTransition,
} from "./states.js";

export type GpsPosition = { lat: number; lng: number };
export type GeofenceCenter = { lat: number; lng: number };

type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export function haversineDistanceM(a: GpsPosition, b: GeofenceCenter): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function computeProposedState(currentState: GeofenceState, distanceM: number): GeofenceState {
  if (distanceM <= DEPARTING_RADIUS_M) {
    if (currentState === "approaching" || currentState === "idle") return "at";
    if (currentState === "departing") return "at";
    return currentState === "departed" ? "at" : currentState;
  }
  if (distanceM <= APPROACHING_RADIUS_M) {
    if (currentState === "idle" || currentState === "departed") return "approaching";
    if (currentState === "at" || currentState === "dwelling") return "departing";
    return currentState;
  }
  if (currentState === "approaching") return "idle";
  if (currentState === "departing") return "departed";
  return currentState;
}

export function geofenceCenterFromVertices(vertices: unknown): GeofenceCenter | null {
  if (!Array.isArray(vertices) || vertices.length === 0) return null;
  let latSum = 0;
  let lngSum = 0;
  let count = 0;
  for (const v of vertices) {
    if (v && typeof v === "object" && "lat" in v && "lng" in v) {
      latSum += Number((v as { lat: number }).lat);
      lngSum += Number((v as { lng: number }).lng);
      count += 1;
    }
  }
  if (count === 0) return null;
  return { lat: latSum / count, lng: lngSum / count };
}

export type TransitionStateInput = {
  operatingCompanyId: string;
  geofenceId: string;
  vehicleId: string;
  gpsPosition: GpsPosition;
  geofenceCenter: GeofenceCenter;
  loadId?: string | null;
  stopId?: string | null;
  triggerSource?: "gps_event" | "manual" | "timeout" | "recompute";
  actorUserId?: string;
};

export type TransitionStateResult =
  | { changed: false; current_state: GeofenceState }
  | { changed: true; from_state: GeofenceState; to_state: GeofenceState; transition_id: string };

export async function transitionState(
  client: QueryClient,
  input: TransitionStateInput
): Promise<TransitionStateResult> {
  const row = await client.query<{ current_state: string | null }>(
    `
      SELECT COALESCE(current_state, 'idle') AS current_state
      FROM geo.geofences
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
      FOR UPDATE
    `,
    [input.geofenceId, input.operatingCompanyId]
  );
  const rawCurrent = row.rows[0]?.current_state ?? "idle";
  const currentState: GeofenceState = isGeofenceState(rawCurrent) ? rawCurrent : "idle";

  const distanceM = haversineDistanceM(input.gpsPosition, input.geofenceCenter);
  const proposed = computeProposedState(currentState, distanceM);
  if (proposed === currentState) {
    return { changed: false, current_state: currentState };
  }

  const validation = validateGeofenceTransition(currentState, proposed);
  if (validation) {
    throw new Error(`E_ILLEGAL_GEOFENCE_TRANSITION:${currentState}->${proposed}`);
  }

  const now = new Date().toISOString();
  const trigger = input.triggerSource ?? "gps_event";
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO geo.geofence_state_transitions (
        operating_company_id, geofence_id, vehicle_id, load_id, stop_id,
        from_state, to_state, transitioned_at, trigger_source, raw_payload
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8::timestamptz, $9, $10::jsonb)
      RETURNING id::text
    `,
    [
      input.operatingCompanyId,
      input.geofenceId,
      input.vehicleId,
      input.loadId ?? null,
      input.stopId ?? null,
      currentState,
      proposed,
      now,
      trigger,
      JSON.stringify({ distance_m: distanceM, lat: input.gpsPosition.lat, lng: input.gpsPosition.lng }),
    ]
  );

  await client.query(
    `
      UPDATE geo.geofences
      SET current_state = $3, state_updated_at = $4::timestamptz
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
    `,
    [input.geofenceId, input.operatingCompanyId, proposed, now]
  );

  if (input.actorUserId) {
    await appendCrudAudit(client, input.actorUserId, "geo.geofence.state_transition", {
      resource_type: "geo.geofences",
      resource_id: input.geofenceId,
      from_state: currentState,
      to_state: proposed,
      vehicle_id: input.vehicleId,
      trigger_source: trigger,
    });
  }

  return {
    changed: true,
    from_state: currentState,
    to_state: proposed,
    transition_id: inserted.rows[0]?.id ?? "",
  };
}
