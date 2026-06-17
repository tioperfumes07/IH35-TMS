// Trimble Maps (PC*MILER) Single Search Geocoding — SERVER-SIDE ONLY.
//
// KEY HANDLING (hard rules): TRIMBLE_MAPS_API_KEY is read ONLY here (backend), NEVER sent to the browser,
// NEVER logged. Config is fully env-driven (key + base URL + region) so swapping the 30-day trial key for
// a paid key later is a secret change with NO code change. The whole integration is gated behind
// PCMILER_ENABLED (default OFF) — nothing calls Trimble until the flag is "true".
//
// Trial caps are tiny (Geocoding 2,500). Callers MUST debounce + cache; this module just performs the
// single lookup. The proxy route adds the server-side cache + min-length gate.

type TrimbleConfig = { apiKey: string; baseUrl: string; region: string };
let cachedConfig: TrimbleConfig | null = null;

/** The whole PC*MILER integration is OFF unless PCMILER_ENABLED === "true". */
export function isPcmilerEnabled(): boolean {
  return process.env.PCMILER_ENABLED === "true";
}

function loadConfig(): TrimbleConfig | null {
  if (cachedConfig) return cachedConfig;
  const apiKey = process.env.TRIMBLE_MAPS_API_KEY?.trim();
  if (!apiKey) return null;
  cachedConfig = {
    apiKey,
    // Config-driven so a paid-key cutover (different host/region) is env-only.
    baseUrl: (process.env.TRIMBLE_MAPS_BASE_URL || "https://singlesearch.alk.com").replace(/\/$/, ""),
    region: process.env.TRIMBLE_MAPS_REGION || "na",
  };
  return cachedConfig;
}

/** True only when the API key is present. Independent of the flag (caller checks both). */
export function isTrimbleConfigured(): boolean {
  return loadConfig() !== null;
}

export type GeocodeResult = {
  formatted: string;
  address_line1: string;
  city: string;
  state: string;
  country: string;
  zip: string;
  lat: number | null;
  lon: number | null;
};

type TrimbleLocation = {
  Address?: {
    StreetAddress?: string;
    City?: string;
    State?: string;
    StateAbbreviation?: string;
    Country?: string;
    CountryAbbreviation?: string;
    Zip?: string;
  };
  Coords?: { Lat?: number; Lon?: number };
};

/** Single Search Geocoding. Returns parsed candidates. Throws on config/HTTP errors (caller maps to 502). */
export async function singleSearchGeocode(query: string, maxResults = 5): Promise<GeocodeResult[]> {
  const cfg = loadConfig();
  if (!cfg) throw new Error("trimble_not_configured");
  // authToken in the query string is how Trimble Single Search authenticates; this request is server→Trimble
  // only — the key never reaches the browser.
  const url =
    `${cfg.baseUrl}/${cfg.region}/api/search` +
    `?query=${encodeURIComponent(query)}&maxResults=${encodeURIComponent(String(maxResults))}` +
    `&authToken=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`trimble_geocode_http_${res.status}`);
  const data = (await res.json()) as { Locations?: TrimbleLocation[] };
  const locations = Array.isArray(data?.Locations) ? data.Locations : [];
  return locations.map((loc): GeocodeResult => {
    const a = loc.Address ?? {};
    const c = loc.Coords ?? {};
    return {
      formatted: [a.StreetAddress, a.City, a.StateAbbreviation ?? a.State, a.Zip].filter(Boolean).join(", "),
      address_line1: a.StreetAddress ?? "",
      city: a.City ?? "",
      state: a.StateAbbreviation ?? a.State ?? "",
      country: a.CountryAbbreviation ?? a.Country ?? "",
      zip: a.Zip ?? "",
      lat: typeof c.Lat === "number" ? c.Lat : null,
      lon: typeof c.Lon === "number" ? c.Lon : null,
    };
  });
}
