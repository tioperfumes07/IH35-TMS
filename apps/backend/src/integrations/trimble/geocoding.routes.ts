import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session-middleware.js";
import {
  isPcmilerEnabled,
  isTrimbleConfigured,
  singleSearchGeocode,
  type GeocodeResult,
} from "./trimble-maps-client.js";
import {
  isGooglePlacesConfigured,
  isGooglePlacesEnabled,
  searchAddress as googleSearchAddress,
} from "../google/google-places-client.js";

// 2026-09-05 owner: "the only flags that are off by law are QBO flags" — this field must return real
// addresses. Provider chain: Trimble/PC*MILER when PCMILER_ENABLED + key, otherwise Google when
// GOOGLE_PLACES_ENABLED + key (RULING 3, #19826). Same GeocodeResult shape from either provider, so
// AddressGeocodeInput / stopGeocodePatches need no change. Both OFF → { enabled:false } (plain text box).
type GeocodeProvider = "trimble" | "google";
function activeProvider(): GeocodeProvider | null {
  if (isPcmilerEnabled() && isTrimbleConfigured()) return "trimble";
  if (isGooglePlacesEnabled() && isGooglePlacesConfigured()) return "google";
  return null;
}

// PC*MILER / Trimble geocoding proxy. The FRONTEND calls THIS endpoint; only THIS server calls Trimble,
// so the TRIMBLE_MAPS_API_KEY never reaches the browser. The route ALWAYS mounts; the PCMILER_ENABLED flag
// is checked INSIDE the handler (gating registration on an unset env var is exactly the class of bug that
// 404'd the forecast routes — avoid it). Flag OFF or key missing → { enabled:false, results:[] }, so the
// caller degrades to the plain text field with zero Trimble calls.

const MIN_QUERY = 3;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min — identical lookups don't re-spend the 2,500 trial cap.
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; results: GeocodeResult[] }>();

function cacheGet(key: string): GeocodeResult[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.results;
}
function cacheSet(key: string, results: GeocodeResult[]) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), results });
}

export async function registerGeocodingRoutes(app: FastifyInstance) {
  app.get("/api/v1/geocoding/search", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    // Flag + config gate: nothing calls a provider unless its flag is ON and its key is set.
    const provider = activeProvider();
    if (!provider) {
      return { enabled: false, results: [] as GeocodeResult[] };
    }
    const q = String((req.query as { q?: unknown })?.q ?? "").trim();
    if (q.length < MIN_QUERY) return { enabled: true, provider, results: [] as GeocodeResult[] };

    const key = `${provider}:${q.toLowerCase()}`;
    const cached = cacheGet(key);
    if (cached) return { enabled: true, provider, results: cached, cached: true };

    try {
      const results: GeocodeResult[] =
        provider === "trimble" ? await singleSearchGeocode(q) : await googleSearchAddress(q);
      cacheSet(key, results);
      return { enabled: true, provider, results };
    } catch (e) {
      // Never log the key/url — only the error class.
      req.log?.error({ err: e instanceof Error ? e.message : String(e) }, `${provider}_geocode_failed`);
      return reply.code(502).send({ enabled: true, results: [] as GeocodeResult[], error: "geocode_failed" });
    }
  });
}
