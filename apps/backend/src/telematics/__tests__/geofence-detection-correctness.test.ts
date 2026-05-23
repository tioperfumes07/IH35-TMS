import { describe, expect, it } from "vitest";
import { computeGeofenceTransition } from "../geofence-detector.service.js";

describe("geofence detection correctness", () => {
  it("computes transitions from known inside/outside states", () => {
    expect(computeGeofenceTransition(null, true)).toBe("entered");
    expect(computeGeofenceTransition("entered", true)).toBeNull();
    expect(computeGeofenceTransition("entered", false)).toBe("exited");
    expect(computeGeofenceTransition("exited", false)).toBeNull();
  });
});
