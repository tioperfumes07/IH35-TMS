/** GAP-54 — WF-051 arrival prompt radius (Jorge 2026-05-20: 250 feet, not 25 miles). */
export const WF_051_ARRIVAL_RADIUS_METERS = 76.2;
export const WF_051_LEGACY_RADIUS_METERS = 40233.6;
export const WF_051_RADIUS_CHANGE_AUDIT_DATE = "2026-06-05";
/** Samsara Addresses circle radiusMeters is integer meters. */
export const SAMSARA_GEOFENCE_RADIUS_METERS = Math.round(WF_051_ARRIVAL_RADIUS_METERS);
/** TMS square vertices: half-side = arrival radius so the fence matches the 250 ft circle. */
export const TMS_AUTO_GEOFENCE_SIDE_METERS = WF_051_ARRIVAL_RADIUS_METERS * 2;
