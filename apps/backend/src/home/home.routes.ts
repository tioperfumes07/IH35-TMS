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
      // LV-115 — `?entity=` accepts an operating_company_id OR an org.companies.code (the UI sends the
      // CODE, e.g. ?entity=USMCA). The previous logic was `isUuid ? rawEntity : "ALL"`, so a code cast to
      // no uuid and SILENTLY became ALL: the endpoint answered 200 with the three-entity SUM under every
      // entity button. Verified live on deploy dc85375 — TRANSP/USMCA/TRK each returned hop.gl = 1766,
      // which is 1747 + 13 + 6; the UUIDs returned the real 1747 / 13 / 6. The owner's progress board was
      // showing merged totals as per-entity numbers.
      //
      // Note what this was NOT: the SQL predicate was correct and RLS was never breached. The caller
      // simply never asked for a scope, so no guard on the query text could see it (same trap as
      // ACCT-F120) — which is why the guard for this asserts the RESPONSE's entity_scope instead.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawEntity);
      let entity: string | null = isUuid ? rawEntity : null;

      if (rawEntity && !isUuid) {
        // Resolve a code to its id. Read through the bypass because org.companies is entity-scoped and
        // the caller's own scope is exactly what we are trying to establish.
        const resolved = await withLuciaBypass(async (client) => {
          const res = await client.query<{ id: string }>(
            `SELECT id::text AS id FROM org.companies WHERE upper(code) = upper($1) AND deactivated_at IS NULL LIMIT 1`,
            [rawEntity]
          );
          return res.rows[0]?.id ?? null;
        });
        // FAIL LOUD. An unresolvable entity must never fall back to ALL — that silent widening is the
        // whole defect. A caller asking for one entity and receiving every entity is worse than an error.
        if (!resolved) {
          return reply.code(400).send({
            error: "unknown_entity",
            message: `entity "${rawEntity}" is not a known operating company id or code`,
          });
        }
        entity = resolved;
      }

      // Absent/empty entity still legitimately means ALL — that is the unfiltered board, explicitly asked for.
      const entityScope = entity ?? "ALL";

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
