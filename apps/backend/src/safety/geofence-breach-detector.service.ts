import { normalizeVertices, pointInPolygon } from "../telematics/geofence.js";

export type GeofenceId = string;

export type PositionPoint = {
  latitude: number;
  longitude: number;
};

export type GeofenceShape = {
  geofence_id: GeofenceId;
  vertices_json: unknown;
};

export type GeofenceBreachTransition = {
  entered: GeofenceId[];
  exited: GeofenceId[];
};

export function detectGeofenceBreaches(
  previous_position: PositionPoint,
  current_position: PositionPoint,
  geofences: GeofenceShape[]
): GeofenceBreachTransition {
  const entered: GeofenceId[] = [];
  const exited: GeofenceId[] = [];

  for (const geofence of geofences) {
    const vertices = normalizeVertices(geofence.vertices_json);
    if (vertices.length < 3) continue;

    const wasInside = pointInPolygon(previous_position.latitude, previous_position.longitude, vertices);
    const isInside = pointInPolygon(current_position.latitude, current_position.longitude, vertices);

    if (!wasInside && isInside) entered.push(geofence.geofence_id);
    if (wasInside && !isInside) exited.push(geofence.geofence_id);
  }

  return { entered, exited };
}
