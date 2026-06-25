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
  return patches;
}
