import type { MdataLocation } from "../../../api/mdata";
import type { StopFieldPatch } from "./book-load-stop-geocode";

/**
 * GO-24 — map a picked mdata.locations catalog row onto a stop's form fields, same shape as
 * stopGeocodePatches (pure + exported so a guard can prove the mapping). Only non-empty fields are
 * emitted so a picked location never clears a field the operator already typed for a column the
 * catalog row happens to leave blank.
 */
export function stopLocationPatches(index: number, location: MdataLocation): StopFieldPatch[] {
  const patches: StopFieldPatch[] = [];
  const add = (suffix: string, value: string | undefined | null) => {
    if (value) patches.push({ field: `stops.${index}.${suffix}`, value });
  };
  add("location_id", location.id);
  add("address_full", location.address);
  add("address_line1", location.address);
  add("city", location.city);
  add("state", location.state);
  add("postal_code", location.postal_code);
  add("country", location.country);
  const addCoord = (suffix: "latitude" | "longitude", n: number | null | undefined) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return;
    patches.push({ field: `stops.${index}.${suffix}`, value: String(n) });
  };
  addCoord("latitude", location.lat);
  addCoord("longitude", location.lng);
  return patches;
}

/** Clearing the picker (allowClear ×) must clear the FK too — never leave a stale location_id behind. */
export function stopLocationClearPatch(index: number): StopFieldPatch {
  return { field: `stops.${index}.location_id`, value: "" };
}
