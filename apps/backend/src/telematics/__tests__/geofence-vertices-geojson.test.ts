import { describe, expect, it } from "vitest";
import { normalizeVertices, pointInPolygon } from "../geofence.js";

// Real vertices of "Newbern Scale Facility - I-81 SB / NB (Virginia)" as stored (GeoJSON [lng, lat]).
const NEWBERN = [[-80.672136, 37.0812], [-80.674791, 37.086349], [-80.6812, 37.088482], [-80.687609, 37.086349], [-80.690264, 37.0812], [-80.687609, 37.076051], [-80.6812, 37.073918], [-80.674791, 37.076051]];

describe("ROUND 306 E-29 — GeoJSON [lng, lat] fence vertices", () => {
  it("normalizes [lng, lat] arrays instead of dropping them to zero vertices", () => {
    const v = normalizeVertices(NEWBERN);
    expect(v).toHaveLength(8);
    expect(v[0]).toEqual({ lat: 37.0812, lng: -80.672136 });
  });
  it("a fix at the station centre is inside; one 2 km away is not", () => {
    const v = normalizeVertices(NEWBERN);
    expect(pointInPolygon(37.0812, -80.6812, v)).toBe(true);
    expect(pointInPolygon(37.0992, -80.6812, v)).toBe(false);
  });
  it("still reads the {lat, lng} object shape unchanged", () => {
    expect(normalizeVertices([{ lat: 1, lng: 2 }])).toEqual([{ lat: 1, lng: 2 }]);
  });
});
