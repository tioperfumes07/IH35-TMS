// Google Geocoding (Places) — SERVER-SIDE ONLY.
//
// KEY HANDLING (hard rules, same as trimble-maps-client.ts): GOOGLE_PLACES_API_KEY is read ONLY
// here (backend), NEVER sent to the browser, NEVER logged. The whole integration is gated behind
// GOOGLE_PLACES_ENABLED (default OFF) — nothing calls Google until the flag is "true" AND the key
// is configured.
//
// SCOPE (owner ruling, RULING 3, 2026-09-02): "Google Places on the ADDRESS FIELD ONLY. Never
// miles." This module answers ADDRESS lookups (street/city/state/zip/lat/lng) only. It must never
// be used to compute or fill mileage — miles stay on catalogs.lane_mileage / the PC*MILER
// integration in ../trimble/, untouched by this file. The owner sets the key value directly in the
// Render environment; it never appears in this repo, a doc, or a config file.

type PlacesConfig = { apiKey: string };
let cachedConfig: PlacesConfig | null = null;

/** The whole Google Places integration is OFF unless GOOGLE_PLACES_ENABLED === "true". */
export function isGooglePlacesEnabled(): boolean {
  return process.env.GOOGLE_PLACES_ENABLED === "true";
}

function loadConfig(): PlacesConfig | null {
  if (cachedConfig) return cachedConfig;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) return null;
  cachedConfig = { apiKey };
  return cachedConfig;
}

/** True only when the API key is present. Independent of the flag (caller checks both). */
export function isGooglePlacesConfigured(): boolean {
  return loadConfig() !== null;
}

// Same shape as trimble-maps-client.ts's GeocodeResult so callers (AddressGeocodeInput,
// stopGeocodePatches) can consume either provider without a frontend change.
export type AddressResult = {
  formatted: string;
  address_line1: string;
  city: string;
  state: string;
  country: string;
  zip: string;
  lat: number | null;
  lon: number | null;
};

type GoogleAddressComponent = { long_name: string; short_name: string; types: string[] };
type GoogleGeocodeResult = {
  formatted_address?: string;
  address_components?: GoogleAddressComponent[];
  geometry?: { location?: { lat?: number; lng?: number } };
};

function component(components: GoogleAddressComponent[], type: string, useShort = false): string {
  const hit = components.find((c) => c.types.includes(type));
  if (!hit) return "";
  return useShort ? hit.short_name : hit.long_name;
}

/** Forward geocode a free-typed address. Returns parsed candidates. Throws on config/HTTP errors
 *  (caller maps to 502). Mirrors singleSearchGeocode's contract exactly. */
export async function searchAddress(query: string, maxResults = 5): Promise<AddressResult[]> {
  const cfg = loadConfig();
  if (!cfg) throw new Error("google_places_not_configured");
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(query)}&components=country:US|country:MX&key=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`google_places_http_${res.status}`);
  const data = (await res.json()) as { status?: string; results?: GoogleGeocodeResult[] };
  // Google's API returns 200 with a body-level status for quota/auth errors — never throw a raw key
  // leak, just surface a stable error class.
  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`google_places_status_${data.status}`);
  }
  const results = Array.isArray(data.results) ? data.results.slice(0, maxResults) : [];
  return results.map((r): AddressResult => {
    const comps = r.address_components ?? [];
    const streetNumber = component(comps, "street_number");
    const route = component(comps, "route");
    return {
      formatted: r.formatted_address ?? "",
      address_line1: [streetNumber, route].filter(Boolean).join(" "),
      city: component(comps, "locality") || component(comps, "postal_town") || component(comps, "sublocality"),
      state: component(comps, "administrative_area_level_1", true),
      country: component(comps, "country", true),
      zip: component(comps, "postal_code"),
      lat: typeof r.geometry?.location?.lat === "number" ? r.geometry.location.lat : null,
      lon: typeof r.geometry?.location?.lng === "number" ? r.geometry.location.lng : null,
    };
  });
}
