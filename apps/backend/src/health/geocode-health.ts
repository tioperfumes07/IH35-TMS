/**
 * 443.102 — the geocode provider health probe, run INSIDE the deployed app because the provider key
 * (GOOGLE_PLACES_* / Trimble PC*MILER) exists only in the Render environment. ROUND 168 ("THE BREAK IS
 * GEOCODING"): 179 of 381 USMCA stops failed with provider_unavailable because no provider was configured.
 * scripts/verify-geocode-provider-is-reachable.mjs reads this endpoint post-deploy; a CI runner has no key,
 * so running the check there could only ever report the runner's own missing key.
 *
 * Geocodes ONE fixed, well-known US address — never caller input, never load data — and caches the outcome
 * for GEOCODE_HEALTH_TTL_MS so a public probe cannot be used to spend provider quota.
 */
import { geocodeAddressWithEvidence, type GeocodableAddress, type GeocodeOutcome } from "../telematics/stop-geocode-fallback.service.js";

export const GEOCODE_HEALTH_ADDRESS: GeocodableAddress = {
  address_line1: "1600 Pennsylvania Avenue NW",
  city: "Washington",
  state: "DC",
  postal_code: "20500",
  country: "US",
};
export const GEOCODE_HEALTH_TTL_MS = 10 * 60 * 1000;

export type GeocodeHealth = {
  ok: boolean;
  source: string | null;
  reason: string | null;
  precision: string | null;
  checked_at: string;
  cached: boolean;
};

let last: { at: number; value: Omit<GeocodeHealth, "cached"> } | null = null;

export function toGeocodeHealth(outcome: GeocodeOutcome, at: Date): Omit<GeocodeHealth, "cached"> {
  return outcome.ok
    ? { ok: true, source: String(outcome.source), reason: null, precision: String(outcome.precision ?? ""), checked_at: at.toISOString() }
    : { ok: false, source: null, reason: String(outcome.reason), precision: null, checked_at: at.toISOString() };
}

export async function geocodeHealth(
  now: () => number = Date.now,
  geocode: (a: GeocodableAddress) => Promise<GeocodeOutcome> = geocodeAddressWithEvidence,
): Promise<GeocodeHealth> {
  const t = now();
  if (last && t - last.at < GEOCODE_HEALTH_TTL_MS) return { ...last.value, cached: true };
  let outcome: GeocodeOutcome;
  try {
    outcome = await geocode(GEOCODE_HEALTH_ADDRESS);
  } catch {
    outcome = { ok: false, reason: "probe_threw" };
  }
  last = { at: t, value: toGeocodeHealth(outcome, new Date(t)) };
  return { ...last.value, cached: false };
}

export function resetGeocodeHealthCacheForTest(): void {
  last = null;
}
