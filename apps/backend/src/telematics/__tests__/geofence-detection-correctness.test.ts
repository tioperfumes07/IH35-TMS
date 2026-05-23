import { describe, expect, it } from "vitest";
import { computeGeofenceTransition, pointInPolygon } from "../geofence-detector.service.js";

describe("geofence detection correctness", () => {
  it("computes transitions from known inside/outside states", () => {
    expect(computeGeofenceTransition(null, true)).toBe("entered");
    expect(computeGeofenceTransition("entered", true)).toBeNull();
    expect(computeGeofenceTransition("entered", false)).toBe("exited");
    expect(computeGeofenceTransition("exited", false)).toBeNull();
  });

  it("detects inside/outside with ray-casting polygon checks", () => {
    const vertices = [
      { lng: -97.75, lat: 30.28 },
      { lng: -97.73, lat: 30.28 },
      { lng: -97.73, lat: 30.26 },
      { lng: -97.75, lat: 30.26 },
    ];

    expect(pointInPolygon(30.2672, -97.7431, vertices)).toBe(true);
    expect(pointInPolygon(30.25, -97.7431, vertices)).toBe(false);
  });
});
