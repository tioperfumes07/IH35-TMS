import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session-middleware.js";
import {
  isPcmilerEnabled,
  isTrimbleConfigured,
  singleSearchGeocode,
  type GeocodeResult,
} from "./trimble-maps-client.js";

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
  app.get("/api/v1/geocoding/search", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    // Flag + config gate: nothing calls Trimble unless the flag is ON and the key is set.
    if (!isPcmilerEnabled() || !isTrimbleConfigured()) {
      return { enabled: false, results: [] as GeocodeResult[] };
    }
    const q = String((req.query as { q?: unknown })?.q ?? "").trim();
    if (q.length < MIN_QUERY) return { enabled: true, results: [] as GeocodeResult[] };

    const key = q.toLowerCase();
    const cached = cacheGet(key);
    if (cached) return { enabled: true, results: cached, cached: true };

    try {
      const results = await singleSearchGeocode(q);
      cacheSet(key, results);
      return { enabled: true, results };
    } catch (e) {
      // Never log the key/url — only the error class.
      req.log?.error({ err: e instanceof Error ? e.message : String(e) }, "pcmiler_geocode_failed");
      return reply.code(502).send({ enabled: true, results: [] as GeocodeResult[], error: "geocode_failed" });
    }
  });
}
