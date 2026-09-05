// Google Places API (New) Text Search + Geocoding fallback — SERVER-SIDE ONLY.
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
// stopGeocodePatches) can consume either provider without a frontend change. `name` is additive:
// the business/place name when the match came from Places Text Search (e.g. "Tyson Foods").
export type AddressResult = {
  formatted: string;
  address_line1: string;
  city: string;
  state: string;
  country: string;
  zip: string;
  lat: number | null;
  lon: number | null;
  name?: string;
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

function fromComponents(
  comps: GoogleAddressComponent[],
  formatted: string,
  lat: number | null,
  lon: number | null,
  name?: string,
): AddressResult {
  const streetNumber = component(comps, "street_number");
  const route = component(comps, "route");
  return {
    formatted,
    address_line1: [streetNumber, route].filter(Boolean).join(" "),
    city: component(comps, "locality") || component(comps, "postal_town") || component(comps, "sublocality"),
    state: component(comps, "administrative_area_level_1", true),
    country: component(comps, "country", true),
    zip: component(comps, "postal_code"),
    lat,
    lon,
    ...(name ? { name } : {}),
  };
}

// ---- Places API (New) Text Search — owner 2026-09-05: "one of those search comboboxes where you type in
// tyson and it starts giving locations". Text Search answers business names AND street addresses with the
// full address broken into components. Field mask is the Essentials/Pro set only (no photos, reviews,
// hours) so each call stays in the lowest SKU. Bias: continental US + Mexico (our lanes), no hard filter.
type PlacesNewComponent = { longText?: string; shortText?: string; types?: string[] };
type PlacesNewPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: PlacesNewComponent[];
  location?: { latitude?: number; longitude?: number };
  types?: string[];
};
const PLACES_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.types";

async function textSearch(query: string, maxResults: number, apiKey: string): Promise<AddressResult[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACES_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: Math.min(Math.max(maxResults, 1), 20),
      languageCode: "en",
      // Rectangle covering the continental US + Mexico. Bias only (never a filter).
      locationBias: {
        rectangle: {
          low: { latitude: 14.0, longitude: -125.0 },
          high: { latitude: 49.5, longitude: -66.0 },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`google_places_text_http_${res.status}`);
  const data = (await res.json()) as { places?: PlacesNewPlace[] };
  const places = Array.isArray(data.places) ? data.places : [];
  return places.map((pl) => {
    const comps: GoogleAddressComponent[] = (pl.addressComponents ?? []).map((c) => ({
      long_name: c.longText ?? "",
      short_name: c.shortText ?? c.longText ?? "",
      types: c.types ?? [],
    }));
    const lat = typeof pl.location?.latitude === "number" ? pl.location.latitude : null;
    const lon = typeof pl.location?.longitude === "number" ? pl.location.longitude : null;
    const name = pl.displayName?.text?.trim();
    const formatted = pl.formattedAddress ?? "";
    // A bare street address comes back with displayName == the address; only keep name when it adds information.
    const keepName = name && formatted && !formatted.toLowerCase().startsWith(name.toLowerCase()) ? name : undefined;
    return fromComponents(comps, formatted, lat, lon, keepName);
  });
}

async function geocode(query: string, maxResults: number, apiKey: string): Promise<AddressResult[]> {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(query)}&components=country:US|country:MX&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`google_places_http_${res.status}`);
  const data = (await res.json()) as { status?: string; results?: GoogleGeocodeResult[] };
  // Google's API returns 200 with a body-level status for quota/auth errors — never throw a raw key
  // leak, just surface a stable error class.
  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`google_places_status_${data.status}`);
  }
  const results = Array.isArray(data.results) ? data.results.slice(0, maxResults) : [];
  return results.map((r) =>
    fromComponents(
      r.address_components ?? [],
      r.formatted_address ?? "",
      typeof r.geometry?.location?.lat === "number" ? r.geometry.location.lat : null,
      typeof r.geometry?.location?.lng === "number" ? r.geometry.location.lng : null,
    ),
  );
}

/** Address / business-name lookup for the Book Load address field. Places Text Search (New) first — it
 *  answers "tyson" with every Tyson location — then the Geocoding API as fallback for strings Text Search
 *  cannot place. Throws on config/HTTP errors (caller maps to 502). Mirrors singleSearchGeocode's contract. */
export async function searchAddress(query: string, maxResults = 5): Promise<AddressResult[]> {
  const cfg = loadConfig();
  if (!cfg) throw new Error("google_places_not_configured");
  const viaPlaces = await textSearch(query, maxResults, cfg.apiKey);
  // Keep only rows that resolved to a real street-level or postal-level address (a bare "United States"
  // or "Laredo, TX" row is noise in an address picker).
  const usable = viaPlaces.filter((r) => r.address_line1 || r.zip);
  if (usable.length > 0) return usable.slice(0, maxResults);
  const viaGeocode = await geocode(query, maxResults, cfg.apiKey);
  return viaGeocode.filter((r) => r.address_line1 || r.zip);
}
