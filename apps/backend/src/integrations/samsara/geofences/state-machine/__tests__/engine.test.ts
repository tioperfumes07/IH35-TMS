import { describe, expect, it } from "vitest";
import { computeProposedState, haversineDistanceM } from "../engine.js";
import { GEOFENCE_STATES, VALID_TRANSITIONS, validateGeofenceTransition } from "../states.js";

describe("geofence state machine engine", () => {
  it("defines all 6 states with explicit transition rules", () => {
    expect(GEOFENCE_STATES).toHaveLength(6);
    for (const state of GEOFENCE_STATES) {
      expect(VALID_TRANSITIONS[state]).toBeDefined();
    }
  });

  it("rejects illegal transitions such as idle to departed", () => {
    const err = validateGeofenceTransition("idle", "departed");
    expect(err?.error).toBe("illegal_geofence_transition");
  });

  it("accepts idle to approaching", () => {
    expect(validateGeofenceTransition("idle", "approaching")).toBeNull();
  });

  it("computes approaching from idle when within approach radius", () => {
    const center = { lat: 27.5, lng: -99.5 };
    const position = { lat: 27.51, lng: -99.5 };
    const distance = haversineDistanceM(position, center);
    expect(distance).toBeLessThan(2000);
    expect(computeProposedState("idle", distance)).toBe("approaching");
  });

  it("computes at when within departing radius", () => {
    expect(computeProposedState("approaching", 100)).toBe("at");
  });
});
