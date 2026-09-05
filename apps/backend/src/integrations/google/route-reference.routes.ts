import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { computeRouteReference, isGoogleRoutesConfigured, isGoogleRoutesEnabled, type RouteReferenceResult } from "./routes-api-client.js";

// DSP-48 (owner ruling 2026-09-05, "LAW §2 row: Google distance = REFERENCE ONLY"). This proxy
// is the ONLY server code allowed to call Google's Routes API — same key-isolation discipline as
// every other integrations/google/* or integrations/trimble/* route: the API key never reaches
// the browser, and the response here is a reference figure the wizard displays next to (never
// into) Practical/Short/Empty. The caller (wizard) supplies the already-resolved leg endpoints
// (stop lat/lng, or the yard's lat/lng for the Empty leg) -- this route does not resolve
// addresses or know what a "yard" is; it is a stateless "quote these legs" proxy, one Routes API
// call per leg, so a partial failure (one bad leg) never blocks the others.

const latLngSchema = z.object({ lat: z.number(), lng: z.number() });
const legSchema = z.object({ from: latLngSchema, to: latLngSchema });
const bodySchema = z.object({ legs: z.array(legSchema).min(1).max(25) });

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min, per DSP-48's own spec.
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; result: RouteReferenceResult }>();

/** Rounds to 4 decimal places (~11m precision) so near-identical picks share a cache entry
 *  without conflating genuinely different addresses. */
function roundCoord(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function cacheKey(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  return `${roundCoord(from.lat)},${roundCoord(from.lng)}->${roundCoord(to.lat)},${roundCoord(to.lng)}`;
}

function cacheGet(key: string): RouteReferenceResult | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.result;
}

function cacheSet(key: string, result: RouteReferenceResult) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), result });
}

export async function registerRouteReferenceRoutes(app: FastifyInstance) {
  app.post("/api/v1/geocoding/route-reference", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    if (!isGoogleRoutesEnabled() || !isGoogleRoutesConfigured()) {
      return { enabled: false, legs: [] as Array<RouteReferenceResult | null> };
    }
    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid_legs", details: parsed.error.flatten() });

    const legs = await Promise.all(
      parsed.data.legs.map(async ({ from, to }) => {
        const key = cacheKey(from, to);
        const cached = cacheGet(key);
        if (cached) return { ...cached, cached: true };
        const result = await computeRouteReference(from, to);
        if (result) cacheSet(key, result);
        return result ? { ...result, cached: false } : null;
      })
    );
    return { enabled: true, legs };
  });
}
