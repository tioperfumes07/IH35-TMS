import { describe, expect, it } from "vitest";
import { detectGeofenceBreaches } from "../geofence-breach-detector.service.js";

const square = [
  { lat: 1, lng: -1 },
  { lat: 1, lng: 1 },
  { lat: -1, lng: 1 },
  { lat: -1, lng: -1 },
];

describe("geofence breach detector", () => {
  it("detects entry into geofence", () => {
    const result = detectGeofenceBreaches(
      { latitude: 2, longitude: 2 },
      { latitude: 0, longitude: 0 },
      [{ geofence_id: "g1", vertices_json: square }]
    );
    expect(result.entered).toEqual(["g1"]);
    expect(result.exited).toEqual([]);
  });

  it("detects exit from geofence", () => {
    const result = detectGeofenceBreaches(
      { latitude: 0, longitude: 0 },
      { latitude: 2, longitude: 2 },
      [{ geofence_id: "g1", vertices_json: square }]
    );
    expect(result.entered).toEqual([]);
    expect(result.exited).toEqual(["g1"]);
  });

  it("does not emit when staying inside", () => {
    const result = detectGeofenceBreaches(
      { latitude: 0.1, longitude: 0.1 },
      { latitude: 0.2, longitude: 0.2 },
      [{ geofence_id: "g1", vertices_json: square }]
    );
    expect(result).toEqual({ entered: [], exited: [] });
  });

  it("does not emit when staying outside", () => {
    const result = detectGeofenceBreaches(
      { latitude: 2, longitude: 2 },
      { latitude: 3, longitude: 3 },
      [{ geofence_id: "g1", vertices_json: square }]
    );
    expect(result).toEqual({ entered: [], exited: [] });
  });

  it("treats polygon edge as inside (no false transition)", () => {
    const result = detectGeofenceBreaches(
      { latitude: 1, longitude: 0 },
      { latitude: 0.5, longitude: 0 },
      [{ geofence_id: "g1", vertices_json: square }]
    );
    expect(result).toEqual({ entered: [], exited: [] });
  });
});
