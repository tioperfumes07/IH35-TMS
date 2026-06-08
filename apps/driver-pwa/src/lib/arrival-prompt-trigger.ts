/**
 * GAP-54 — Driver PWA arrival prompt trigger (250-foot WF-051 radius).
 * Mirrors backend constant; keep in sync with wf-051-radius.ts.
 */
export const WF_051_ARRIVAL_RADIUS_METERS = 76.2;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function shouldShowArrivalPrompt(
  currentLat: number,
  currentLng: number,
  stopLat: number,
  stopLng: number
): boolean {
  return haversineMeters(currentLat, currentLng, stopLat, stopLng) <= WF_051_ARRIVAL_RADIUS_METERS;
}
