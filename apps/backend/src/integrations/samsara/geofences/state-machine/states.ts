export const GEOFENCE_STATES = ["idle", "approaching", "at", "dwelling", "departing", "departed"] as const;

export type GeofenceState = (typeof GEOFENCE_STATES)[number];

export const VALID_TRANSITIONS: Record<GeofenceState, readonly GeofenceState[]> = {
  idle: ["approaching"],
  approaching: ["at", "idle"],
  at: ["dwelling", "departing"],
  dwelling: ["departing"],
  departing: ["departed", "at"],
  departed: ["idle"],
} as const;

export const APPROACHING_RADIUS_M = 2000;
export const DWELL_THRESHOLD_MIN = 5;
export const DEPARTING_RADIUS_M = 500;

export type GeofenceTransitionError = {
  error: "illegal_geofence_transition";
  from_state: GeofenceState;
  to_state: GeofenceState;
};

export function isGeofenceState(value: string): value is GeofenceState {
  return (GEOFENCE_STATES as readonly string[]).includes(value);
}

export function validateGeofenceTransition(
  fromState: string,
  toState: string
): GeofenceTransitionError | null {
  if (!isGeofenceState(fromState) || !isGeofenceState(toState)) {
    return {
      error: "illegal_geofence_transition",
      from_state: (fromState as GeofenceState) ?? "idle",
      to_state: (toState as GeofenceState) ?? "idle",
    };
  }
  if (fromState === toState) return null;
  const allowed = VALID_TRANSITIONS[fromState];
  if (!allowed.includes(toState)) {
    return { error: "illegal_geofence_transition", from_state: fromState, to_state: toState };
  }
  return null;
}
