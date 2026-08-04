import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { currentAuthUser } from "../accounting/shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { buildScenarioTracker, MAX_AGE_SECONDS, type ScenarioTrackerResponse } from "./scenario-tracker.service.js";

function redirectPreservingQuery(app: FastifyInstance, fromPath: string, toPath: string) {
  app.get(fromPath, async (req, reply) => {
    const q = req.query as Record<string, unknown>;
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) for (const item of v) sp.append(k, String(item));
      else sp.append(k, String(v));
    }
    const suffix = sp.toString();
    const dest = `${toPath}${suffix ? `?${suffix}` : ""}`;
    return reply.code(307).redirect(dest);
  });
}

/**
 * HOMEPAGE LIVE SCENARIO TRACKER §7 — in-memory cache ONLY.
 *
 * A short TTL exists purely to protect the DB from a 20s poll; it is NEVER a file and NEVER longer
 * than max_age_seconds. The cached body keeps its ORIGINAL generated_at, so a stale reply is visibly
 * stale to the FE's heartbeat instead of silently masquerading as fresh — that is the whole point of
 * killing docs/audit/program-scoreboard.json.
 */
type CacheEntry = { at: number; body: ScenarioTrackerResponse };
const scenarioCache = new Map<string, CacheEntry>();

/** Canonical `/api/v1/home/*` aliases for dashboard consumers (implementation lives under reports). */
export async function registerHomeRoutes(app: FastifyInstance) {
  redirectPreservingQuery(app, "/api/v1/home/attention-list", "/api/v1/reports/home-attention-list");
  redirectPreservingQuery(app, "/api/v1/home/fleet-snapshot", "/api/v1/reports/home-fleet-snapshot");

  app.get(
    "/api/v1/home/scenario-tracker",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      // The tracker reads across entities through withLuciaBypass, so authentication is mandatory and
      // an explicitly requested entity must be one the caller actually belongs to — otherwise the
      // bypass would let any signed-in user probe another company's live money state.
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const q = (req.query ?? {}) as Record<string, unknown>;
      const rawEntity = typeof q.entity === "string" ? q.entity.trim() : "";
      // ?entity= accepts an operating_company_id; anything else (or absent) means ALL.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawEntity);
      const entity = isUuid ? rawEntity : null;
      const entityScope = isUuid ? rawEntity : "ALL";

      if (entity) await assertCompanyMembership(user.uuid, entity);

      const cached = scenarioCache.get(entityScope);
      if (cached && Date.now() - cached.at < MAX_AGE_SECONDS * 1000) {
        return reply.header("cache-control", "no-store").send(cached.body);
      }

      try {
        const body = await withLuciaBypass(function probeAll(client) {
          return buildScenarioTracker(client, entity, entityScope);
        });
        scenarioCache.set(entityScope, { at: Date.now(), body });
        return reply.header("cache-control", "no-store").send(body);
      } catch (err) {
        // Never serve a stale body as if it were current: fail loudly so the FE shows its STALE
        // banner rather than rendering old numbers.
        req.log?.error?.({ err }, "[home] scenario-tracker probe failed");
        return reply.code(503).send({
          error: "scenario_tracker_unavailable",
          message: err instanceof Error ? err.message : "probe failed",
        });
      }
    }
  );
}
