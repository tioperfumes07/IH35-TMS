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
  /** Address descriptor landmarks from Place Details (New) when Google returns them — e.g. "Love's Travel Stop (across the road, 120 m)". */
  landmarks?: string[];
};

/** One Autocomplete (New) prediction. `placeId` resolves through placeDetails(). */
export type AddressSuggestion = {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
  types: string[];
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

// Bias (never a filter) toward the yard. Measured 2026-09-05 with a continent-wide rectangle: "1424 alameda lar"
// ranked Chicago/Greensboro above Laredo and "tyson" ranked Tysons Corner, VA above Tyson Foods. Google's guidance
// is to bias to where the user operates; Autocomplete/Text Search cap a circle bias at 50,000 m. Default is the
// Laredo yard; override per deployment with GEOCODE_BIAS_LAT / GEOCODE_BIAS_LNG / GEOCODE_BIAS_RADIUS_M.
function num(v: string | undefined, d: number): number {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
}
const US_MX_BIAS = {
  circle: {
    center: {
      latitude: num(process.env.GEOCODE_BIAS_LAT, 27.5036),
      longitude: num(process.env.GEOCODE_BIAS_LNG, -99.5076),
    },
    radius: Math.min(50000, Math.max(1000, num(process.env.GEOCODE_BIAS_RADIUS_M, 50000))),
  },
};

type PlacesNewPrediction = {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
    types?: string[];
  };
};

/** Places Autocomplete (New) — per-keystroke predictions. `sessionToken` groups the keystrokes and the
 *  following placeDetails() call into ONE billable session (Google's documented pattern). */
export async function autocomplete(input: string, sessionToken: string, maxResults = 6): Promise<AddressSuggestion[]> {
  const cfg = loadConfig();
  if (!cfg) throw new Error("google_places_not_configured");
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": cfg.apiKey },
    body: JSON.stringify({
      input,
      sessionToken,
      languageCode: "en",
      includedRegionCodes: ["us", "mx"],
      includeQueryPredictions: false,
      locationBias: US_MX_BIAS,
    }),
  });
  if (!res.ok) throw new Error(`google_places_autocomplete_http_${res.status}`);
  const data = (await res.json()) as { suggestions?: PlacesNewPrediction[] };
  const out: AddressSuggestion[] = [];
  for (const s of data.suggestions ?? []) {
    const pp = s.placePrediction;
    if (!pp?.placeId) continue;
    out.push({
      placeId: pp.placeId,
      text: pp.text?.text ?? "",
      mainText: pp.structuredFormat?.mainText?.text ?? pp.text?.text ?? "",
      secondaryText: pp.structuredFormat?.secondaryText?.text ?? "",
      types: pp.types ?? [],
    });
    if (out.length >= maxResults) break;
  }
  return out;
}

type PlacesNewDescriptor = {
  landmarks?: Array<{
    displayName?: { text?: string };
    straightLineDistanceMeters?: number;
    spatialRelationship?: string;
  }>;
};

function landmarksOf(d: PlacesNewDescriptor | undefined): string[] | undefined {
  const rows = (d?.landmarks ?? [])
    .map((l) => {
      const n = l.displayName?.text?.trim();
      if (!n) return "";
      const rel = (l.spatialRelationship ?? "").toLowerCase().replace(/_/g, " ");
      const dist = typeof l.straightLineDistanceMeters === "number" ? `${Math.round(l.straightLineDistanceMeters)} m` : "";
      const tail = [rel && rel !== "near" ? rel : "", dist].filter(Boolean).join(", ");
      return tail ? `${n} (${tail})` : n;
    })
    .filter(Boolean)
    .slice(0, 5);
  return rows.length ? rows : undefined;
}

/** Place Details (New) for one prediction — the "address selection" step. Same sessionToken as the
 *  autocomplete calls closes the session. Field mask kept to address fields + addressDescriptor
 *  (landmarks for driver instructions); never photos/reviews/hours. */
export async function placeDetails(placeId: string, sessionToken?: string): Promise<AddressResult | null> {
  const cfg = loadConfig();
  if (!cfg) throw new Error("google_places_not_configured");
  const qs = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${qs}`, {
    headers: {
      "X-Goog-Api-Key": cfg.apiKey,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,addressComponents,location,types,addressDescriptor",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`google_places_details_http_${res.status}`);
  const pl = (await res.json()) as PlacesNewPlace & { addressDescriptor?: PlacesNewDescriptor };
  const comps: GoogleAddressComponent[] = (pl.addressComponents ?? []).map((c) => ({
    long_name: c.longText ?? "",
    short_name: c.shortText ?? c.longText ?? "",
    types: c.types ?? [],
  }));
  const lat = typeof pl.location?.latitude === "number" ? pl.location.latitude : null;
  const lon = typeof pl.location?.longitude === "number" ? pl.location.longitude : null;
  const name = pl.displayName?.text?.trim();
  const formatted = pl.formattedAddress ?? "";
  const keepName = name && formatted && !formatted.toLowerCase().startsWith(name.toLowerCase()) ? name : undefined;
  const r = fromComponents(comps, formatted, lat, lon, keepName);
  const lm = landmarksOf(pl.addressDescriptor);
  return lm ? { ...r, landmarks: lm } : r;
}

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
      // HARD restriction, not bias: measured 2026-09-05 19:30Z with bias only, "frio foods" returned Springs, South Africa
      // and "hjm" returned Hounslow, England. Text Search accepts locationBias OR locationRestriction (rectangle only);
      // our lanes are the continental US + Mexico, so restrict to that box. Autocomplete keeps includedRegionCodes us/mx.
      locationRestriction: {
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
