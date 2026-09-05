// ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT Step 2: "Circles → polygons: geo.geofences.
// vertices_json needs ≥3 vertices (migration 0220). Generate polygon from centre + radius; store
// the radius so it can be regenerated." geo.geofences has no native circle representation — only
// vertices_json (>=3 points, CHECK-enforced). A Samsara circle geofence is approximated as a
// regular N-sided polygon around the centre, at the real radius Samsara reports (never redrawn
// to a fixed size — the existing squareVerticesFromCenter() in telematics/auto-geofence.service.ts
// is a DIFFERENT, deliberately-fixed-size shape for load-stop auto-geofencing with no known
// radius; reusing it here would silently replace Samsara's own radius with an arbitrary square,
// which is exactly the "redraw it" the ORDER forbids).

export type LatLngVertex = { lat: number; lng: number };

const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Approximates a circle (centre + radius) as a closed regular polygon. `sides` defaults to 16 —
 * enough to read as a circle on a map and to keep entry/exit detection accurate, while staying a
 * small, storable vertex count. The exact radius is the caller's job to persist separately
 * (geo.geofences has no radius column; the ORDER's "store the radius so it can be regenerated"
 * lands on integrations.samsara_addresses.geofence_json, the raw mirror, not on the projected
 * polygon — this function is the regeneration step itself).
 */
export function circleToPolygonVertices(
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
  sides = 16
): LatLngVertex[] {
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
    throw new Error("circleToPolygonVertices requires a finite center lat/lng");
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    throw new Error("circleToPolygonVertices requires a positive finite radiusMeters");
  }
  if (!Number.isInteger(sides) || sides < 3) {
    throw new Error("circleToPolygonVertices requires an integer sides count >= 3");
  }

  const latDelta = radiusMeters / METERS_PER_DEGREE_LAT;
  const lngDelta = radiusMeters / (METERS_PER_DEGREE_LAT * Math.max(0.1, Math.cos((centerLat * Math.PI) / 180)));

  const vertices: LatLngVertex[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (2 * Math.PI * i) / sides;
    vertices.push({
      lat: centerLat + latDelta * Math.sin(angle),
      lng: centerLng + lngDelta * Math.cos(angle),
    });
  }
  return vertices;
}

/**
 * Samsara's documented Address API shape (per Samsara's public API reference — NOT yet verified
 * against a live sample from this org's own data, since integrations.samsara_addresses does not
 * exist yet to have pulled one; re-confirm the exact field nesting against a real response the
 * first time this runs and fix here if it differs, rather than trusting this comment):
 *   geofence: { circle: { latitude, longitude, radiusMeters } }
 *   geofence: { polygon: { vertices: [{ latitude, longitude }, ...] } }
 * Normalizes either shape to geo.geofences.vertices_json's own {lat,lng}[] format, generating the
 * circle approximation where needed. Returns null (never a shape around a guess) when the input
 * carries neither recognizable shape — the caller must treat that as an unresolved point, not
 * draw anything.
 */
export function normalizeSamsaraGeofenceToVertices(geofenceJson: unknown): LatLngVertex[] | null {
  if (!geofenceJson || typeof geofenceJson !== "object") return null;
  const g = geofenceJson as Record<string, unknown>;

  const circle = g.circle as { latitude?: number; longitude?: number; radiusMeters?: number } | undefined;
  if (circle && typeof circle.latitude === "number" && typeof circle.longitude === "number") {
    const radius = typeof circle.radiusMeters === "number" && circle.radiusMeters > 0 ? circle.radiusMeters : null;
    if (radius == null) return null;
    return circleToPolygonVertices(circle.latitude, circle.longitude, radius);
  }

  const polygon = g.polygon as { vertices?: Array<{ latitude?: number; longitude?: number }> } | undefined;
  if (Array.isArray(polygon?.vertices) && polygon.vertices.length >= 3) {
    const vertices = polygon.vertices
      .filter((v): v is { latitude: number; longitude: number } => typeof v.latitude === "number" && typeof v.longitude === "number")
      .map((v) => ({ lat: v.latitude, lng: v.longitude }));
    return vertices.length >= 3 ? vertices : null;
  }

  return null;
}
