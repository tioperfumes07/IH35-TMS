export const GEOFENCE_STATES = ["idle", "approaching", "at", "dwelling", "departing", "departed"] as const;

export type GeofenceState = (typeof GEOFENCE_STATES)[number];

// GAP-39 DEFECT B FIX (2026-09-05): `departed` had no outgoing edge at all — the machine dead-
// locked there (proven live: stuck since 2026-09-03 19:06:32 while 14 units kept reporting).
// `idle` is the normal reset once the truck is fully gone; `approaching` is added for the case
// where the truck immediately starts a NEW approach on the same geofence without ever reaching
// full idle distance (e.g. a yard with repeat traffic).
export const VALID_TRANSITIONS: Record<GeofenceState, readonly GeofenceState[]> = {
  idle: ["approaching"],
  approaching: ["at", "idle"],
  at: ["dwelling", "departing"],
  dwelling: ["departing"],
  departing: ["departed", "at"],
  departed: ["idle", "approaching"],
} as const;

// GAP-39 DEFECT A contributing cause (2026-09-05 spec): equal enter/exit radii is what makes a
// boundary flap — a truck sitting exactly at the edge alternates every tick. Real values, not
// arbitrary: ARRIVE (enter) is always smaller than DEPART (exit) — hysteresis is mandatory.
export const DEFAULT_APPROACH_RADIUS_M = 8047; // 5 miles — "close to a city" warning ring
export const DEFAULT_ARRIVE_RADIUS_M = 402; // 0.25 mile — enter "at"
export const DEFAULT_DEPART_RADIUS_M = 805; // 0.5 mile — must clear THIS to leave "at"/"dwelling"
export const FUEL_STOP_APPROACH_RADIUS_M = 3219; // 2 miles — smaller ring, there are 604 of these

export const DWELL_THRESHOLD_MIN = 5;
export const DEPART_SPEED_MPH = 15;
export const DEPART_SUSTAINED_MIN = 3;

// Legacy names, kept exported so nothing that imported them at the old (non-hysteresis) values
// breaks silently — do not delete, per the order. New code should use the DEFAULT_* names above.
export const APPROACHING_RADIUS_M = DEFAULT_APPROACH_RADIUS_M;
export const DEPARTING_RADIUS_M = DEFAULT_ARRIVE_RADIUS_M;

export type GeofenceRadii = {
  approachRadiusM?: number | null;
  arriveRadiusM?: number | null;
  departRadiusM?: number | null;
};

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

/**
 * Pure DISTANCE-only geometric proposal. Speed-gating for at/dwelling -> departing lives in
 * engine.ts (transitionState), never here — "distance alone must not fire it" (owner order,
 * 2026-09-05): GPS jitter right at the arrive/depart boundary is exactly what produced 3,127
 * false idle<->approaching transitions on geofence 188cf90c.
 *
 * Radii come from the geofence's own row when present, falling back to the DEFAULT_* constants
 * — per-geofence radii (geo.geofences.radius_m / approach_radius_m, migration #4) are not
 * required for this function to be correct today; it degrades cleanly to the shared defaults.
 */
export function computeProposedState(
  currentState: GeofenceState,
  distanceM: number,
  radii: GeofenceRadii = {}
): GeofenceState {
  const approachRadiusM = radii.approachRadiusM ?? DEFAULT_APPROACH_RADIUS_M;
  const arriveRadiusM = radii.arriveRadiusM ?? DEFAULT_ARRIVE_RADIUS_M;
  const departRadiusM = radii.departRadiusM ?? DEFAULT_DEPART_RADIUS_M;

  // Inside the arrival ring: resolves to "at" from anything that isn't already dwelling further
  // in (dwelling has no forward edge back to "at" — it only ever moves on to "departing").
  if (distanceM <= arriveRadiusM) {
    if (currentState === "dwelling") return "dwelling";
    return "at";
  }

  // Beyond the departure (exit) ring — always > arriveRadiusM, this is the hysteresis gap doing
  // its job. A truck already mid-"departing" is confirmed gone.
  if (distanceM > departRadiusM) {
    if (currentState === "departing") return "departed";

    // GAP-39 DEFECT B FIX: fully outside the approach ring too — nothing lingers forever in
    // "approaching" or "departed". This is the exact edge that was missing and dead-locked the
    // machine; distance > approachRadiusM from "departed" now genuinely resets to "idle".
    if (distanceM > approachRadiusM) {
      if (currentState === "approaching" || currentState === "departed") return "idle";
      return currentState;
    }

    // Between depart and approach radius: "idle" or a lingering "departed" both start a fresh
    // approach here (a truck can head back toward the same site without ever reaching full idle
    // distance first — that is exactly why VALID_TRANSITIONS.departed includes "approaching", not
    // only "idle"). "at"/"dwelling" do NOT propose "departing" purely from distance — engine.ts's
    // speed gate owns that edge; this function only ever offers "departed" as the confirming step
    // once a "departing" state already exists.
    if (currentState === "idle" || currentState === "departed") return "approaching";
    return currentState;
  }

  // Between arrive and depart radius: the hysteresis dead zone itself. No new state is entered
  // here on distance alone — this is deliberately a no-op band.
  return currentState;
}

/**
 * Full-cycle graph check: every state must have somewhere to go (GAP-39 DEFECT B — "departed"
 * used to have none). Returns the states with a dead end, empty when the graph is healthy.
 */
export function terminalStates(): GeofenceState[] {
  return GEOFENCE_STATES.filter((state) => VALID_TRANSITIONS[state].length === 0);
}
