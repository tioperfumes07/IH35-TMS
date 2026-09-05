import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPROACH_RADIUS_M,
  DEFAULT_ARRIVE_RADIUS_M,
  DEFAULT_DEPART_RADIUS_M,
  GEOFENCE_STATES,
  VALID_TRANSITIONS,
  computeProposedState,
  terminalStates,
  validateGeofenceTransition,
} from "../states.js";

describe("GAP-39 DEFECT B — departed is no longer a dead end", () => {
  it("walks the full cycle idle -> approaching -> at -> dwelling -> departing -> departed -> idle with every edge legal", () => {
    const path: Array<[string, string]> = [
      ["idle", "approaching"],
      ["approaching", "at"],
      ["at", "dwelling"],
      ["dwelling", "departing"],
      ["departing", "departed"],
      ["departed", "idle"],
    ];
    for (const [from, to] of path) {
      expect(validateGeofenceTransition(from, to)).toBeNull();
    }
  });

  it("has no terminal state — every state has at least one outgoing edge", () => {
    expect(terminalStates()).toEqual([]);
    for (const state of GEOFENCE_STATES) {
      expect(VALID_TRANSITIONS[state].length).toBeGreaterThan(0);
    }
  });

  it("computeProposedState actually returns idle from departed once past the approach radius — the exact live dead-lock (geofence 188cf90c, stuck since 2026-09-03)", () => {
    expect(computeProposedState("departed", DEFAULT_APPROACH_RADIUS_M + 1)).toBe("idle");
  });

  it("departed can also re-approach directly without first passing through idle", () => {
    expect(computeProposedState("departed", DEFAULT_DEPART_RADIUS_M + 1)).toBe("approaching");
  });
});

describe("hysteresis — enter and exit radii differ, so a boundary position never flaps", () => {
  it("a position between arrive and depart radius holds the current state (the dead zone)", () => {
    const midBand = (DEFAULT_ARRIVE_RADIUS_M + DEFAULT_DEPART_RADIUS_M) / 2;
    expect(computeProposedState("at", midBand)).toBe("at");
    expect(computeProposedState("approaching", midBand)).toBe("approaching");
  });

  it("distance alone never proposes leaving at/dwelling for departing — that edge is speed-gated in engine.ts", () => {
    expect(computeProposedState("at", DEFAULT_DEPART_RADIUS_M + 1)).toBe("at");
    expect(computeProposedState("dwelling", DEFAULT_DEPART_RADIUS_M + 1)).toBe("dwelling");
  });

  it("a truck already departing beyond the depart radius is confirmed departed", () => {
    expect(computeProposedState("departing", DEFAULT_DEPART_RADIUS_M + 1)).toBe("departed");
  });

  it("an override radius genuinely changes the outcome versus the default at the same distance", () => {
    const distance = 450; // inside the DEFAULT arrive radius (402) is false, so default proposes non-"at"
    expect(computeProposedState("idle", distance)).not.toBe("at");
    expect(computeProposedState("idle", distance, { arriveRadiusM: 500 })).toBe("at");
  });
});
