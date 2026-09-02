import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session-middleware.js";
import {
  isGooglePlacesEnabled,
  isGooglePlacesConfigured,
  searchAddress,
  type AddressResult,
} from "./google-places-client.js";

// Google address-autocomplete proxy (RULING 3, 2026-09-02). The FRONTEND calls THIS endpoint; only
// THIS server calls Google, so GOOGLE_PLACES_API_KEY never reaches the browser. Same shape as
// ../trimble/geocoding.routes.ts (route ALWAYS mounts; the enabled flag + key are checked INSIDE
// the handler, never on registration — an unset env var must never make the route 404). Flag OFF or
// key missing → { enabled:false, results:[] }, so the caller degrades to a plain text field.
// ADDRESS ONLY — this route must never be consumed for mileage; miles stay on
// catalogs.lane_mileage / the separate Trimble/PC*MILER integration.

const MIN_QUERY = 3;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; results: AddressResult[] }>();

function cacheGet(key: string): AddressResult[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.results;
}
function cacheSet(key: string, results: AddressResult[]) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), results });
}

export async function registerGooglePlacesRoutes(app: FastifyInstance) {
  app.get("/api/v1/address/autocomplete", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    if (!isGooglePlacesEnabled() || !isGooglePlacesConfigured()) {
      return { enabled: false, results: [] as AddressResult[] };
    }
    const q = String((req.query as { q?: unknown })?.q ?? "").trim();
    if (q.length < MIN_QUERY) return { enabled: true, results: [] as AddressResult[] };

    const key = q.toLowerCase();
    const cached = cacheGet(key);
    if (cached) return { enabled: true, results: cached, cached: true };

    try {
      const results = await searchAddress(q);
      cacheSet(key, results);
      return { enabled: true, results };
    } catch (e) {
      // Never log the key/url — only the error class.
      req.log?.error({ err: e instanceof Error ? e.message : String(e) }, "google_places_search_failed");
      return reply.code(502).send({ enabled: true, results: [] as AddressResult[], error: "geocode_failed" });
    }
  });
}
