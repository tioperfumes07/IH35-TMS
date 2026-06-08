import { describe, it, expect } from "vitest";
import { findGeofenceForPosition, BORDER_GEOFENCES } from "../detector.service.js";

describe("border crossing detector", () => {
  it("detects position inside Laredo Bridge III (World Trade)", () => {
    const gf = findGeofenceForPosition(27.5640, -99.4697); // exact center
    expect(gf).not.toBeNull();
    expect(gf?.crossingPoint).toBe("laredo-iii");
  });

  it("returns null for position far from any border", () => {
    const gf = findGeofenceForPosition(29.0, -95.0); // Houston area
    expect(gf).toBeNull();
  });

  it("all 5 border geofences defined", () => {
    expect(BORDER_GEOFENCES).toHaveLength(5);
    const points = BORDER_GEOFENCES.map((g) => g.crossingPoint);
    expect(points).toContain("laredo-i");
    expect(points).toContain("laredo-ii");
    expect(points).toContain("laredo-iii");
    expect(points).toContain("laredo-iv");
    expect(points).toContain("colombia");
  });
});
