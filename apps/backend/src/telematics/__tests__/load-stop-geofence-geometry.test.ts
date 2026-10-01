import { describe, expect, it } from "vitest";
import { circlePolygon, loadStopFenceLabel, loadStopFenceRadiusMeters } from "../../dispatch/geofences/load-stop-geofence-geometry.js";
import { pointInPolygon } from "../geofence.js";

function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

describe("E-25 load-stop geofence geometry", () => {
  it("radius is decided by geocode precision, never guessed", () => {
    expect(loadStopFenceRadiusMeters("rooftop")).toBe(400);
    expect(loadStopFenceRadiusMeters("ROOFTOP")).toBe(400);
    expect(loadStopFenceRadiusMeters("range")).toBe(400);
    expect(loadStopFenceRadiusMeters("RANGE_INTERPOLATED")).toBe(400);
    expect(loadStopFenceRadiusMeters("GEOMETRIC_CENTER")).toBe(600);
    expect(loadStopFenceRadiusMeters("APPROXIMATE")).toBe(600);
    expect(loadStopFenceRadiusMeters("locality")).toBe(null);
    expect(loadStopFenceRadiusMeters(null)).toBe(null);
    expect(loadStopFenceRadiusMeters(undefined)).toBe(null);
    expect(loadStopFenceRadiusMeters("whatever")).toBe(null);
  });

  it("circle polygon contains the measured dock offsets that the 250 ft diamond missed", () => {
    // Walmart 6858 Mebane NC rooftop pin; T156 dwelled 89-295 m away (measured 2026-10-01).
    const lat = 36.0561962, lng = -79.3253782;
    const poly = circlePolygon(lat, lng, 400);
    expect(poly.length).toBe(24);
    for (const v of poly) {
      const d = metersBetween(lat, lng, v.lat, v.lng);
      expect(Math.abs(d - 400) < 2, `vertex at ${d.toFixed(1)} m, expected ~400 m`).toBe(true);
    }
    // 295 m east of the pin -> inside; 450 m east -> outside.
    const dLng = 1 / (111_320 * Math.cos((lat * Math.PI) / 180));
    expect(pointInPolygon(lat, lng + 295 * dLng, poly)).toBe(true);
    expect(pointInPolygon(lat, lng + 450 * dLng, poly)).toBe(false);
    // The old diamond (250 ft = 76 m, 4 vertices) could not contain a truck 89 m from the pin.
    const diamondDeg = 250 / 364000;
    const diamond = [
      { lat: lat + diamondDeg, lng }, { lat, lng: lng + diamondDeg },
      { lat: lat - diamondDeg, lng }, { lat, lng: lng - diamondDeg },
    ];
    expect(pointInPolygon(lat, lng + 89 * dLng, diamond)).toBe(false);
  });

  it("label scheme matches the D-1 stamp join in geofence-detector.service.ts", () => {
    expect(loadStopFenceLabel("abc", 2)).toBe("load-abc-stop-2");
  });
});
