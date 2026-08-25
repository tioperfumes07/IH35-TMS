import type { GeocodeResult } from "../../../api/geocoding";

/**
 * W8 — map a PC*Miler/Trimble geocode result onto a stop's form fields. The booking form field is
 * `postal_code`, but the geocode result carries it as `zip` — that mismatch is why City populated
 * (sometimes) but ZIP never did. Pure + exported so a CI guard can prove the zip→postal_code mapping
 * and it can't silently regress. Only non-empty fields are emitted (graceful: never clears a typed value).
 */
export type StopFieldPatch = { field: string; value: string };

export function stopGeocodePatches(index: number, r: GeocodeResult): StopFieldPatch[] {
  const patches: StopFieldPatch[] = [];
  const add = (suffix: string, value: string | undefined | null) => {
    if (value) patches.push({ field: `stops.${index}.${suffix}`, value });
  };
  add("address_line1", r.address_line1);
  add("city", r.city);
  add("state", r.state);
  add("postal_code", r.zip); // GeocodeResult.zip → form field postal_code
  add("country", r.country);
  // BOOK-LOAD-NOOP: geocode returned lat/lon but only address/city/zip were patched, so the
  // Book payload never carried coordinates and testers saw a filled form with no POST when
  // downstream geofence/zod expected numbers. Omit 0 as the empty sentinel (same as zip "").
  const addCoord = (suffix: "latitude" | "longitude", n: number | null | undefined) => {
    if (typeof n !== "number" || !Number.isFinite(n) || n === 0) return;
    patches.push({ field: `stops.${index}.${suffix}`, value: String(n) });
  };
  addCoord("latitude", r.lat);
  addCoord("longitude", r.lon);
  return patches;
}
