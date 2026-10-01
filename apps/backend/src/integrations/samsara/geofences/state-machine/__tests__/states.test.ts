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

describe("ROUND 306 E-08 — inside/outside comes from the canonical detector, never this machine's radii", () => {
  it("canonical inside walks idle -> approaching -> at, one legal edge per tick", async () => {
    const { computeProposedStateFromCanonical, validateGeofenceTransition } = await import("../states.js");
    expect(computeProposedStateFromCanonical("idle", true, 50_000)).toBe("approaching");
    expect(computeProposedStateFromCanonical("approaching", true, 50_000)).toBe("at");
    expect(computeProposedStateFromCanonical("departing", true, 0)).toBe("at");
    expect(computeProposedStateFromCanonical("dwelling", true, 0)).toBe("dwelling");
    for (const s of ["idle", "approaching", "at", "dwelling", "departing", "departed"] as const) {
      for (const inside of [true, false]) {
        for (const d of [0, 500, 5_000, 50_000]) {
          const next = computeProposedStateFromCanonical(s, inside, d);
          expect(validateGeofenceTransition(s, next)).toBeNull();
        }
      }
    }
  });

  it("distance alone never puts a truck 'at' a fence: 0 m from centre but canonically outside stays approaching", async () => {
    const { computeProposedStateFromCanonical } = await import("../states.js");
    expect(computeProposedStateFromCanonical("approaching", false, 0)).toBe("approaching");
    expect(computeProposedStateFromCanonical("at", false, 0)).toBe("departing");
    expect(computeProposedStateFromCanonical("departing", false, 0)).toBe("departed");
    expect(computeProposedStateFromCanonical("departed", false, 50_000)).toBe("idle");
    expect(computeProposedStateFromCanonical("idle", false, 1_000)).toBe("approaching");
  });
});
