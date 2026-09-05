// Google Routes API (computeRoutes) — SERVER-SIDE ONLY, REFERENCE-DISTANCE USE ONLY.
//
// KEY HANDLING (hard rule, same as google-places-client.ts / trimble-maps-client.ts):
// GOOGLE_PLACES_API_KEY is read ONLY here (backend), NEVER sent to the browser, NEVER logged.
// Routes API was enabled on the SAME Google Cloud project (IH35-TMS) as Places at 19:39Z
// (owner order, DSP-48) and uses the same key.
//
// SCOPE (DSP-48, owner ruling 2026-09-05, "LAW §2 row: Google distance = REFERENCE ONLY" —
// this is a NARROW, EXPLICIT amendment to the earlier RULING 3, 2026-09-02 ban on Google for
// mileage ("Google Places on the ADDRESS FIELD ONLY. Never miles."). This module answers the
// exact same restriction that ban existed to protect: nothing here may write
// miles_practical/miles_shortest, feed pay/RPM/settlement, or otherwise enter a financial
// calculation — verify-google-reference-miles.mjs enforces the boundary at the call sites.
// Real practical/short miles stay on catalogs.lane_mileage / the PC*MILER integration in
// ../trimble/, untouched by this file, exactly as RULING 3 required.
type RoutesConfig = { apiKey: string };
let cachedConfig: RoutesConfig | null = null;

/** Same flag Places already uses — Routes API rides the same Google Cloud project + key. */
export function isGoogleRoutesEnabled(): boolean {
  return process.env.GOOGLE_PLACES_ENABLED === "true";
}

function loadConfig(): RoutesConfig | null {
  if (cachedConfig) return cachedConfig;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) return null;
  cachedConfig = { apiKey };
  return cachedConfig;
}

export function isGoogleRoutesConfigured(): boolean {
  return loadConfig() !== null;
}

export type LatLng = { lat: number; lng: number };

export type RouteReferenceResult = {
  miles: number;
  minutes: number;
};

type ComputeRoutesResponse = {
  routes?: Array<{ distanceMeters?: number; duration?: string }>;
};

const METERS_PER_MILE = 1609.344;

function parseDurationSeconds(duration: string | undefined): number {
  // Routes API returns duration as a string like "67200s".
  if (!duration) return 0;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(duration.trim());
  return match ? Number(match[1]) : 0;
}

/**
 * One computeRoutes call for one leg (origin -> destination, DRIVE mode). Returns null on any
 * config/HTTP/parse failure — a reference figure that fails to load must degrade to "not shown
 * yet", never a thrown error that blocks the wizard.
 */
export async function computeRouteReference(origin: LatLng, destination: LatLng): Promise<RouteReferenceResult | null> {
  const cfg = loadConfig();
  if (!cfg) return null;
  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": cfg.apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: "DRIVE",
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ComputeRoutesResponse;
    const route = data.routes?.[0];
    if (!route || typeof route.distanceMeters !== "number") return null;
    const miles = Math.round((route.distanceMeters / METERS_PER_MILE) * 10) / 10;
    const minutes = Math.round(parseDurationSeconds(route.duration) / 60);
    return { miles, minutes };
  } catch {
    // Never log the key; a transient provider failure degrades to "no reference yet".
    return null;
  }
}
