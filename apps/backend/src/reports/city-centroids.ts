// DEADHEAD-REPORT-ESTIMATED-BRANCH-ALWAYS-RETURNS-ZERO-DEADHEAD
//
// A curated, no-cost, no-external-dependency city-centroid table used ONLY to produce a
// straight-line (great-circle) DISTANCE ESTIMATE for the deadhead report's "estimated" tier — the
// bucket that fires when a load has no real deadhead_miles_to_pickup/miles_deadhead data and the
// previous delivery city differs from the next pickup city.
//
// WHY a static table instead of a live geocoding API: this backend already has a real geocoder
// (apps/backend/src/integrations/trimble/trimble-maps-client.ts, PC*MILER Single Search), but it is
// a PAID, rate-limited third-party integration (trial cap: 2,500 total geocodes, shared across the
// whole app) gated behind PCMILER_ENABLED (default OFF) specifically so nothing calls it without an
// explicit cost decision. Wiring a report that can be viewed/refreshed repeatedly straight into that
// quota is a real recurring-cost decision, not a code fix — out of scope here. A static table of
// major freight-corridor city centroids costs nothing, needs no async plumbing, and directly fixes
// the observed defect (a duplicated dead branch) for the realistic majority of this carrier's actual
// lanes (Laredo-based, US domestic + Mexico cross-border). It intentionally does NOT cover every
// city — a city pair outside this table falls back to the same honest 0 the code already returns
// today for a genuinely unknown case (see resolveDeadheadToPickup in deadhead.service.ts), which is
// not a regression; it is a materially smaller "unknown" surface than "always 0", not a total fix.
//
// Coordinates are approximate city-center points (public geographic knowledge), suitable ONLY for a
// great-circle deadhead ESTIMATE — never for turn-by-turn routing, ETAs, or anything precision-
// sensitive. Keys are lowercased city names only (not city+state) because real load-stop data in
// this system carries inconsistent state formatting (e.g. "TX" vs "Texas" vs missing) — a plain
// city-name key is far more robust against that than a city+state compound key, at the small,
// accepted cost of same-named-city collisions across states for cities not in this list's scope.

export type CityCentroid = { lat: number; lon: number };

const RAW_CENTROIDS: Record<string, CityCentroid> = {
  // Texas — this carrier's home corridor
  laredo: { lat: 27.5064, lon: -99.5075 },
  houston: { lat: 29.7604, lon: -95.3698 },
  "san antonio": { lat: 29.4241, lon: -98.4936 },
  dallas: { lat: 32.7767, lon: -96.797 },
  "fort worth": { lat: 32.7555, lon: -97.3308 },
  austin: { lat: 30.2672, lon: -97.7431 },
  "el paso": { lat: 31.7619, lon: -106.485 },
  "corpus christi": { lat: 27.8006, lon: -97.3964 },
  baytown: { lat: 29.7355, lon: -94.9774 },
  waco: { lat: 31.5493, lon: -97.1467 },
  lubbock: { lat: 33.5779, lon: -101.8552 },
  amarillo: { lat: 35.222, lon: -101.8313 },
  mcallen: { lat: 26.2034, lon: -98.23 },
  brownsville: { lat: 25.9018, lon: -97.4975 },
  beaumont: { lat: 30.08, lon: -94.1266 },
  tyler: { lat: 32.3513, lon: -95.3011 },
  midland: { lat: 31.9973, lon: -102.0779 },
  odessa: { lat: 31.8457, lon: -102.3676 },
  abilene: { lat: 32.4487, lon: -99.7331 },
  killeen: { lat: 31.1171, lon: -97.7278 },
  pharr: { lat: 26.1948, lon: -98.1836 },
  edinburg: { lat: 26.3017, lon: -98.1633 },

  // Major US freight-hub metros
  chicago: { lat: 41.8781, lon: -87.6298 },
  atlanta: { lat: 33.749, lon: -84.388 },
  "los angeles": { lat: 34.0522, lon: -118.2437 },
  phoenix: { lat: 33.4484, lon: -112.074 },
  denver: { lat: 39.7392, lon: -104.9903 },
  "kansas city": { lat: 39.0997, lon: -94.5786 },
  memphis: { lat: 35.1495, lon: -90.049 },
  nashville: { lat: 36.1627, lon: -86.7816 },
  charlotte: { lat: 35.2271, lon: -80.8431 },
  indianapolis: { lat: 39.7684, lon: -86.1581 },
  columbus: { lat: 39.9612, lon: -82.9988 },
  louisville: { lat: 38.2527, lon: -85.7585 },
  "st. louis": { lat: 38.627, lon: -90.1994 },
  "saint louis": { lat: 38.627, lon: -90.1994 },
  "oklahoma city": { lat: 35.4676, lon: -97.5164 },
  "new orleans": { lat: 29.9511, lon: -90.0715 },
  miami: { lat: 25.7617, lon: -80.1918 },
  jacksonville: { lat: 30.3322, lon: -81.6557 },
  tampa: { lat: 27.9506, lon: -82.4572 },
  orlando: { lat: 28.5383, lon: -81.3792 },
  birmingham: { lat: 33.5186, lon: -86.8104 },
  "little rock": { lat: 34.7465, lon: -92.2896 },
  shreveport: { lat: 32.5252, lon: -93.7502 },
  "baton rouge": { lat: 30.4515, lon: -91.1871 },
  wichita: { lat: 37.6872, lon: -97.3301 },
  tulsa: { lat: 36.154, lon: -95.9928 },
  albuquerque: { lat: 35.0844, lon: -106.6504 },
  "las vegas": { lat: 36.1699, lon: -115.1398 },
  "salt lake city": { lat: 40.7608, lon: -111.891 },
  portland: { lat: 45.5152, lon: -122.6784 },
  seattle: { lat: 47.6062, lon: -122.3321 },
  sacramento: { lat: 38.5816, lon: -121.4944 },
  fresno: { lat: 36.7378, lon: -119.7871 },
  "san diego": { lat: 32.7157, lon: -117.1611 },
  "san francisco": { lat: 37.7749, lon: -122.4194 },
  "new york": { lat: 40.7128, lon: -74.006 },
  newark: { lat: 40.7357, lon: -74.1724 },
  edison: { lat: 40.5187, lon: -74.4121 },
  camden: { lat: 39.9259, lon: -75.1196 },
  philadelphia: { lat: 39.9526, lon: -75.1652 },
  baltimore: { lat: 39.2904, lon: -76.6122 },
  "washington": { lat: 38.9072, lon: -77.0369 },
  richmond: { lat: 37.5407, lon: -77.436 },
  charleston: { lat: 32.7765, lon: -79.9311 },
  columbia: { lat: 34.0007, lon: -81.0348 },
  raleigh: { lat: 35.7796, lon: -78.6382 },
  detroit: { lat: 42.3314, lon: -83.0458 },
  cleveland: { lat: 41.4993, lon: -81.6944 },
  cincinnati: { lat: 39.1031, lon: -84.512 },
  milwaukee: { lat: 43.0389, lon: -87.9065 },
  minneapolis: { lat: 44.9778, lon: -93.265 },
  "des moines": { lat: 41.5868, lon: -93.625 },
  omaha: { lat: 41.2565, lon: -95.9345 },
  boise: { lat: 43.615, lon: -116.2023 },
  reno: { lat: 39.5296, lon: -119.8138 },

  // Mexico — cross-border corridor relevant to a Laredo-based carrier
  "nuevo laredo": { lat: 27.4867, lon: -99.5164 },
  monterrey: { lat: 25.6866, lon: -100.3161 },
  "mexico city": { lat: 19.4326, lon: -99.1332 },
  guadalajara: { lat: 20.6597, lon: -103.3496 },
  saltillo: { lat: 25.4232, lon: -101.0053 },
  reynosa: { lat: 26.0806, lon: -98.2989 },
  matamoros: { lat: 25.8697, lon: -97.5028 },
  tijuana: { lat: 32.5149, lon: -117.0382 },
  juarez: { lat: 31.6904, lon: -106.4245 },
  "ciudad juarez": { lat: 31.6904, lon: -106.4245 },
};

/** City-name key: lowercased, trimmed, collapsed whitespace, comma/state suffix stripped. */
function cityKey(cityOrCityState: string): string {
  const withoutState = cityOrCityState.split(",")[0] ?? cityOrCityState;
  return withoutState.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Great-circle (haversine) distance in miles — an ESTIMATE, not a routed road-network mileage. */
export function haversineMiles(a: CityCentroid, b: CityCentroid): number {
  const EARTH_RADIUS_MILES = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Estimated straight-line miles between two free-text city (or "City, ST") strings, or null if
 * either city is outside the curated table — callers must treat null as genuinely unknown, never
 * silently coerce it to 0 and call it a real estimate.
 */
export function estimateCityPairMiles(cityA: string, cityB: string): number | null {
  const a = RAW_CENTROIDS[cityKey(cityA)];
  const b = RAW_CENTROIDS[cityKey(cityB)];
  if (!a || !b) return null;
  return Math.round(haversineMiles(a, b));
}

export const CITY_CENTROIDS_FOR_TEST = RAW_CENTROIDS;
