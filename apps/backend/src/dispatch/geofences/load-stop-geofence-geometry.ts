/**
 * E-25 (Lead, 2026-10-01) — the ONE geometry for a load-stop geofence.
 *
 * MEASURED ROOT CAUSE, live USMCA 2026-10-01: zero `load-<id>-stop-<n>` geofences existed in ANY
 * company, ever (geo.geofences, label LIKE 'load-%-stop-%' = 0 rows), so the only automatic
 * actual_arrival_at writer (geofence-detector.service.ts, D-1) never had a fence to fire on.
 * bindLoadToGeofences only ran at booking, when stops had no coordinates yet, and nothing re-bound
 * after geocoding. Separately, its fence was a 250 ft DIAMOND (4 vertices; inscribed radius
 * ~54 m) — trucks dock 90–320 m from a rooftop pin (13626 Walmart Mebane: 89–295 m; 13637
 * Wilkes-Barre: ~293 ft; 13626 Newcold: ~321 m), so even a bound diamond would have missed.
 *
 * Radius is decided by the stop's geocode precision, never by guessing a facility size:
 *   rooftop / ROOFTOP / range / RANGE_INTERPOLATED  → 400 m   (dock-to-pin spread measured above)
 *   GEOMETRIC_CENTER / APPROXIMATE                  → 600 m   (place-level pin, bigger site)
 *   locality / null / anything else                 → NO FENCE (a city centroid is not a stop;
 *                                                      13625's pickup pin was 9 mi off)
 */
export type StopGeocodePrecision = string | null | undefined;

export const LOAD_STOP_FENCE_VERTICES = 24;

export function loadStopFenceRadiusMeters(precision: StopGeocodePrecision): number | null {
  const p = (precision ?? "").trim().toLowerCase();
  if (p === "rooftop" || p === "range" || p === "range_interpolated") return 400;
  if (p === "geometric_center" || p === "approximate") return 600;
  return null;
}

export function circlePolygon(lat: number, lng: number, radiusMeters: number, vertices = LOAD_STOP_FENCE_VERTICES) {
  const out: Array<{ lat: number; lng: number }> = [];
  const dLat = radiusMeters / 111_320;
  const dLng = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i < vertices; i += 1) {
    const a = (2 * Math.PI * i) / vertices;
    out.push({ lat: lat + dLat * Math.sin(a), lng: lng + dLng * Math.cos(a) });
  }
  return out;
}

export function loadStopFenceLabel(loadId: string, sequence: number): string {
  return `load-${loadId}-stop-${sequence}`;
}
