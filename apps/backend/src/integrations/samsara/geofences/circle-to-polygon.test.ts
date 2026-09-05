import { describe, expect, it } from "vitest";
import { circleToPolygonVertices, normalizeSamsaraGeofenceToVertices } from "./circle-to-polygon.js";

describe("circleToPolygonVertices", () => {
  it("returns the requested number of vertices, all near the radius from center", () => {
    const center = { lat: 27.5306, lng: -99.4803 }; // Laredo, TX
    const radiusMeters = 200;
    const vertices = circleToPolygonVertices(center.lat, center.lng, radiusMeters, 16);
    expect(vertices).toHaveLength(16);
    for (const v of vertices) {
      const dLat = (v.lat - center.lat) * 111_320;
      const dLng = (v.lng - center.lng) * 111_320 * Math.cos((center.lat * Math.PI) / 180);
      const distanceMeters = Math.sqrt(dLat * dLat + dLng * dLng);
      expect(distanceMeters).toBeGreaterThan(radiusMeters * 0.95);
      expect(distanceMeters).toBeLessThan(radiusMeters * 1.05);
    }
  });

  it("defaults to 16 sides", () => {
    expect(circleToPolygonVertices(27.5, -99.5, 100)).toHaveLength(16);
  });

  it("rejects a non-finite center", () => {
    expect(() => circleToPolygonVertices(Number.NaN, -99.5, 100)).toThrow();
  });

  it("rejects a non-positive radius", () => {
    expect(() => circleToPolygonVertices(27.5, -99.5, 0)).toThrow();
    expect(() => circleToPolygonVertices(27.5, -99.5, -10)).toThrow();
  });

  it("rejects fewer than 3 sides", () => {
    expect(() => circleToPolygonVertices(27.5, -99.5, 100, 2)).toThrow();
  });
});

describe("normalizeSamsaraGeofenceToVertices", () => {
  it("converts a circle shape into a >=3-vertex polygon", () => {
    const vertices = normalizeSamsaraGeofenceToVertices({
      circle: { latitude: 27.5306, longitude: -99.4803, radiusMeters: 150 },
    });
    expect(vertices).not.toBeNull();
    expect(vertices!.length).toBeGreaterThanOrEqual(3);
  });

  it("passes through a polygon shape with >=3 vertices unchanged in count", () => {
    const vertices = normalizeSamsaraGeofenceToVertices({
      polygon: {
        vertices: [
          { latitude: 27.53, longitude: -99.48 },
          { latitude: 27.531, longitude: -99.481 },
          { latitude: 27.529, longitude: -99.479 },
        ],
      },
    });
    expect(vertices).toEqual([
      { lat: 27.53, lng: -99.48 },
      { lat: 27.531, lng: -99.481 },
      { lat: 27.529, lng: -99.479 },
    ]);
  });

  it("returns null for a polygon with fewer than 3 vertices — never a shape around a guess", () => {
    const vertices = normalizeSamsaraGeofenceToVertices({
      polygon: { vertices: [{ latitude: 27.53, longitude: -99.48 }] },
    });
    expect(vertices).toBeNull();
  });

  it("returns null for a circle missing a radius", () => {
    const vertices = normalizeSamsaraGeofenceToVertices({
      circle: { latitude: 27.53, longitude: -99.48 },
    });
    expect(vertices).toBeNull();
  });

  it("returns null for null/undefined/empty input — an unresolved point, never a fabricated shape", () => {
    expect(normalizeSamsaraGeofenceToVertices(null)).toBeNull();
    expect(normalizeSamsaraGeofenceToVertices(undefined)).toBeNull();
    expect(normalizeSamsaraGeofenceToVertices({})).toBeNull();
  });
});
