/**
 * GO-19-2b Section 6 (owner 2026-09-03): the mileage PROVIDER contract. A provider is a distance
 * engine -- SELF-HOSTED OSM ROUTING (OSRM or Valhalla), certified 0.67% median absolute error
 * against 7,601 reference loads. NOT Trimble/PC*MILER (geocoding only, no routing endpoint, trial
 * expired). NOT Google (Maps Platform terms §19.3 cap cached lat/lng at 30 consecutive days,
 * §19.2 bars using the content with a non-Google map; a mileage that pays a driver must be stored
 * PERMANENTLY and be reproducible years later).
 *
 * LAW (same one chain-deadhead.service.ts already states): a provider that cannot compute returns
 * NULL WITH A REASON. NEVER 0. A 0 in a mileage field is a claim that the distance IS zero.
 */
export type MileagePoint = { lat: number; lng: number };

export type MileageRouteResult =
  | { practical_miles: number; shortest_miles: number | null; reason?: undefined }
  | { practical_miles: null; shortest_miles: null; reason: string };

export interface MileageProvider {
  /** Stable provider identity, stored on catalogs.point_mileage.engine (provenance, never null). */
  readonly name: string;
  /** Provider build/version identity, stored on catalogs.point_mileage.engine_version. */
  readonly version: string;
  route(from: MileagePoint, to: MileagePoint): Promise<MileageRouteResult>;
}
