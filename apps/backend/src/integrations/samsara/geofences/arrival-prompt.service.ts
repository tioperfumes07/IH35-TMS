/**
 * GAP-54 — WF-051 arrival prompt geofence evaluation.
 */
import { WF_051_ARRIVAL_RADIUS_METERS } from "./wf-051-radius.js";

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinArrivalRadius(
  vehicleLat: number,
  vehicleLng: number,
  stopLat: number,
  stopLng: number
): boolean {
  return haversineMeters(vehicleLat, vehicleLng, stopLat, stopLng) <= WF_051_ARRIVAL_RADIUS_METERS;
}

export function shouldTriggerArrivalPrompt(
  vehicleLat: number,
  vehicleLng: number,
  stopLat: number,
  stopLng: number
): { trigger: boolean; distance_meters: number } {
  const distance_meters = haversineMeters(vehicleLat, vehicleLng, stopLat, stopLng);
  return { trigger: distance_meters <= WF_051_ARRIVAL_RADIUS_METERS, distance_meters };
}
