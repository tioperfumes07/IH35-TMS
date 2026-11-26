/**
 * PERFUME-CONTACTS — Google business search for TIO Perfumes prospects (owner 2026-11-25 22:09 CT, to the research
 * session: "Yes ask for it and I want is possible all the data").
 *
 * Its own Google Places (New) Text Search call with its OWN field mask. The trucking address search
 * (integrations/google/google-places-client.ts, PLACES_FIELD_MASK — address autocomplete and facilityAtPoint) is not
 * imported, not reused and not changed: a guard test freezes that mask byte for byte.
 *
 * Field mask = every business field Places (New) returns for a text search. Phone, website, opening hours and rating are
 * Google's "Text Search Enterprise" fields (the request is billed at the highest field it asks for) — approved by the owner.
 * Google never returns email, owner, salesperson or LinkedIn: those stay blank and the company reads "needs email".
 */

/** NEVER reuse or edit the trucking PLACES_FIELD_MASK — this constant is the perfume one. */
export const PERFUME_PROSPECT_FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.addressComponents", "places.location", "places.types", "places.primaryType",
  "places.businessStatus", "places.googleMapsUri",
  "places.nationalPhoneNumber", "places.internationalPhoneNumber", "places.websiteUri",
  "places.regularOpeningHours", "places.rating", "places.userRatingCount",
].join(",");

/** Google returns at most 20 per page and 60 per query (3 pages). */
export const GOOGLE_PAGE_SIZE = 20;
export const GOOGLE_MAX_PAGES = 3;

export type ProspectCity = { city: string; state: string; country: "US" | "MX" };
export type ProspectKeyword = { en: string; es: string; category: string; customerType: string | null };

/** The research session's city list (ROUND P1.2), word for word: 27 US + 17 MX. */
export const PROSPECT_CITIES: ProspectCity[] = [
  { city: "Miami-Dade", state: "FL", country: "US" }, { city: "Broward County", state: "FL", country: "US" }, { city: "Palm Beach County", state: "FL", country: "US" },
  { city: "Newark", state: "NJ", country: "US" }, { city: "New York City", state: "NY", country: "US" }, { city: "Long Island", state: "NY", country: "US" },
  { city: "Laredo", state: "TX", country: "US" }, { city: "Eagle Pass", state: "TX", country: "US" }, { city: "Del Rio", state: "TX", country: "US" },
  { city: "El Paso", state: "TX", country: "US" }, { city: "Presidio", state: "TX", country: "US" }, { city: "McAllen", state: "TX", country: "US" },
  { city: "Hidalgo", state: "TX", country: "US" }, { city: "Pharr", state: "TX", country: "US" }, { city: "Brownsville", state: "TX", country: "US" },
  { city: "Rio Grande City", state: "TX", country: "US" }, { city: "Roma", state: "TX", country: "US" }, { city: "Progreso", state: "TX", country: "US" },
  { city: "Nogales", state: "AZ", country: "US" }, { city: "Douglas", state: "AZ", country: "US" }, { city: "San Luis", state: "AZ", country: "US" },
  { city: "Yuma", state: "AZ", country: "US" }, { city: "Calexico", state: "CA", country: "US" }, { city: "El Centro", state: "CA", country: "US" },
  { city: "San Diego", state: "CA", country: "US" }, { city: "San Ysidro", state: "CA", country: "US" }, { city: "Otay Mesa", state: "CA", country: "US" },
  { city: "Nuevo Laredo", state: "Tamaulipas", country: "MX" }, { city: "Reynosa", state: "Tamaulipas", country: "MX" }, { city: "Río Bravo", state: "Tamaulipas", country: "MX" },
  { city: "Matamoros", state: "Tamaulipas", country: "MX" }, { city: "Miguel Alemán", state: "Tamaulipas", country: "MX" }, { city: "Camargo", state: "Tamaulipas", country: "MX" },
  { city: "Piedras Negras", state: "Coahuila", country: "MX" }, { city: "Ciudad Acuña", state: "Coahuila", country: "MX" }, { city: "Ojinaga", state: "Chihuahua", country: "MX" },
  { city: "Ciudad Juárez", state: "Chihuahua", country: "MX" }, { city: "Nogales", state: "Sonora", country: "MX" }, { city: "Agua Prieta", state: "Sonora", country: "MX" },
  { city: "San Luis Río Colorado", state: "Sonora", country: "MX" }, { city: "Mexicali", state: "Baja California", country: "MX" }, { city: "Tijuana", state: "Baja California", country: "MX" },
  { city: "Tecate", state: "Baja California", country: "MX" }, { city: "Guadalajara y Zapopan", state: "Jalisco", country: "MX" },
];

export const PROSPECT_KEYWORDS: ProspectKeyword[] = [
  { en: "perfume store", es: "perfumería", category: "Perfume", customerType: "Retailer" },
  { en: "perfume wholesale", es: "perfumes mayoreo", category: "Perfume", customerType: "Wholesale" },
  { en: "cosmetics store", es: "cosméticos", category: "Cosmetics", customerType: "Retailer" },
  { en: "beauty supply", es: "beauty supply", category: "Cosmetics", customerType: "Retailer" },
  { en: "duty free", es: "free shop", category: "Duty free", customerType: "Duty free" },
  { en: "liquor store", es: "vinos y licores", category: "Liquor", customerType: "Retailer" },
  { en: "liquor wholesale", es: "distribuidora de licores", category: "Liquor", customerType: "Wholesale" },
  { en: "tobacco shop", es: "tabaquería", category: "Tobacco", customerType: "Retailer" },
  { en: "cigar shop", es: "puros", category: "Tobacco", customerType: "Retailer" },
  { en: "beer depot", es: "depósito de cerveza", category: "Beer", customerType: "Retailer" },
];

export type PlannedSearch = { city: ProspectCity; keyword: ProspectKeyword; lang: "en" | "es"; textQuery: string };

export function cityLabel(c: ProspectCity): string {
  return c.country === "MX" ? `${c.city}, ${c.state}, México` : `${c.city}, ${c.state}`;
}

/** Every city × keyword × language. "beauty supply" is the same text in both languages — searched once. */
export function buildPlan(cities = PROSPECT_CITIES, keywords = PROSPECT_KEYWORDS): PlannedSearch[] {
  const out: PlannedSearch[] = [];
  for (const city of cities) {
    for (const keyword of keywords) {
      const langs: Array<"en" | "es"> = keyword.en === keyword.es ? ["en"] : ["en", "es"];
      for (const lang of langs) {
        const word = lang === "en" ? keyword.en : keyword.es;
        out.push({ city, keyword, lang, textQuery: lang === "en" ? `${word} in ${cityLabel(city)}` : `${word} en ${cityLabel(city)}` });
      }
    }
  }
  return out;
}

export function planCounts(plan: PlannedSearch[]) {
  return { searches: plan.length, maxRequests: plan.length * GOOGLE_MAX_PAGES, cities: new Set(plan.map((p) => cityLabel(p.city))).size };
}

type GoogleComponent = { longText?: string; shortText?: string; types?: string[] };
export type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: GoogleComponent[];
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  primaryType?: string;
  businessStatus?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  rating?: number;
  userRatingCount?: number;
};

export type ProspectRow = {
  place_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  phone: string | null;
  phone_intl: string | null;
  website: string | null;
  maps_uri: string | null;
  business_status: string | null;
  primary_type: string | null;
  types: string[];
  rating: number | null;
  rating_count: number | null;
  hours: string[] | null;
};

const comp = (cs: GoogleComponent[], type: string, short = false) => {
  const hit = cs.find((c) => (c.types ?? []).includes(type));
  return hit ? (short ? hit.shortText : hit.longText) ?? null : null;
};

export function toProspectRow(p: GooglePlace): ProspectRow | null {
  const name = p.displayName?.text?.trim();
  if (!p.id || !name) return null;
  const cs = p.addressComponents ?? [];
  return {
    place_id: p.id,
    name,
    address: p.formattedAddress ?? null,
    city: comp(cs, "locality") ?? comp(cs, "sublocality") ?? comp(cs, "administrative_area_level_2"),
    state: comp(cs, "administrative_area_level_1", true),
    zip: comp(cs, "postal_code"),
    country: comp(cs, "country", true),
    phone: p.nationalPhoneNumber ?? null,
    phone_intl: p.internationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    maps_uri: p.googleMapsUri ?? null,
    business_status: p.businessStatus ?? null,
    primary_type: p.primaryType ?? null,
    types: p.types ?? [],
    rating: typeof p.rating === "number" ? p.rating : null,
    rating_count: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    hours: p.regularOpeningHours?.weekdayDescriptions ?? null,
  };
}

/** Last 10 digits of a phone — the dedupe key across US / MX formats ("+52 867 …", "(956) …"). */
export function phone10(s: string | null | undefined): string | null {
  const d = String(s ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

export class GoogleProspectsNotConfigured extends Error {
  constructor() { super("google_places_key_missing"); }
}

export function googleKey(): string | null {
  const k = process.env.GOOGLE_PLACES_API_KEY?.trim();
  return k ? k : null;
}

export type SearchPage = { rows: ProspectRow[]; requests: number; raw: GooglePlace[] };

/** One text query, following nextPageToken up to `maxResults` (≤ 60). Each page is one billed request. */
export async function searchText(
  textQuery: string,
  opts: { maxResults?: number; regionCode?: string; languageCode?: string; fetchImpl?: typeof fetch } = {},
): Promise<SearchPage> {
  const key = googleKey();
  if (!key) throw new GoogleProspectsNotConfigured();
  const f = opts.fetchImpl ?? fetch;
  const max = Math.min(Math.max(opts.maxResults ?? 60, 1), GOOGLE_PAGE_SIZE * GOOGLE_MAX_PAGES);
  const raw: GooglePlace[] = [];
  let pageToken: string | undefined;
  let requests = 0;
  for (let page = 0; page < GOOGLE_MAX_PAGES && raw.length < max; page += 1) {
    const body: Record<string, unknown> = { textQuery, pageSize: Math.min(GOOGLE_PAGE_SIZE, max - raw.length) };
    if (opts.languageCode) body["languageCode"] = opts.languageCode;
    if (opts.regionCode) body["regionCode"] = opts.regionCode;
    if (pageToken) body["pageToken"] = pageToken;
    requests += 1;
    const res = await f("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": `${PERFUME_PROSPECT_FIELD_MASK},nextPageToken` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      // Google's own error text (never the key) so the owner sees e.g. "Places API (New) has not been used in project …".
      let detail = "";
      try { detail = String(((await res.json()) as { error?: { message?: string } }).error?.message ?? ""); } catch { /* no body */ }
      throw new Error(`google_places_http_${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
    }
    const json = (await res.json()) as { places?: GooglePlace[]; nextPageToken?: string };
    raw.push(...(json.places ?? []));
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  const rows = raw.map(toProspectRow).filter((r): r is ProspectRow => r != null);
  return { rows, requests, raw };
}
