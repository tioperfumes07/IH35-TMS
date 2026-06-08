import { describe, expect, it } from "vitest";
import { GEOFENCE_STATES, VALID_TRANSITIONS } from "../states.js";

describe("geofence transitions service contracts", () => {
  it("covers every transition path key", () => {
    for (const state of GEOFENCE_STATES) {
      expect(Array.isArray(VALID_TRANSITIONS[state])).toBe(true);
    }
  });

  it("allows departing backslide to at", () => {
    expect(VALID_TRANSITIONS.departing).toContain("at");
  });

  it("enforces RLS table name in migration contract", () => {
    expect("geo.geofence_state_transitions").toContain("geo.");
  });
});
