/**
 * RELAY-FUEL-INGEST-1 (doc 21/23 Part A): owner-triggered ONE-TIME backfill of historical Relay fuel
 * transactions. The daily cron only pulls yesterday; this endpoint runs runRelayFuelBackfill (the exported
 * 24-month backfill) so the owner can seed the full history on demand. Owner/Administrator only. It ingests
 * per-entity ONLY for operating companies whose RELAY_FUEL_INGEST_ENABLED flag is ON (runRelayFuelBackfill
 * enforces this), reads RELAY_API_KEY/RELAY_API_BASE from env, and writes staging + canonical fuel rows.
 * TMS GL post is deferred to flushFuelGlPostsAfterCommit after commit (EXPENSE_GL_POSTING_ENABLED).
 * The backfill can take a while (API pull per month per company), so it runs in the background and returns 202.
 */
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { requireAuth } from "../../auth/session-middleware.js";
import { withCurrentUser } from "../../auth/db.js";
import { resolveOperatingCompanyId } from "../../auth/operating-company-scope.js";
import { runRelayFuelBackfill } from "./relay-fuel-ingest.cron.js";

export async function registerRelayFuelBackfillRoute(app: FastifyInstance) {
  app.get("/api/integrations/relay/fuel/backfill/status", async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const query = req.query as { operating_company_id?: string } | undefined;
    const requestedCompanyId = query?.operating_company_id?.trim();
    if (!requestedCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });
    const userId = String((req.user as { uuid?: string } | undefined)?.uuid ?? "");
    const status = await withCurrentUser(userId, async (client) => {
      const operatingCompanyId = await resolveOperatingCompanyId(client, userId, requestedCompanyId);
      if (!operatingCompanyId) return null;
      const result = await client.query<{
        run_id: string;
        status: "running" | "completed" | "failed";
        months: number;
        started_at: string;
        completed_at: string | null;
        pulled: number | null;
        upserted: number | null;
        skipped: number | null;
        error: string | null;
      }>(
        `WITH latest_start AS (
           SELECT payload ->> 'run_id' AS run_id,
                  COALESCE((payload ->> 'months')::int, 24) AS months,
                  created_at
           FROM audit.audit_events
           WHERE source = 'RELAY-FUEL-INGEST-1'
             AND event_class = 'integrations.relay_fuel_ingest_backfill_started'
             AND payload ->> 'operating_company_id' = $1
           ORDER BY created_at DESC
           LIMIT 1
         ), terminal AS (
           SELECT e.event_class, e.payload, e.created_at
           FROM audit.audit_events e
           JOIN latest_start s ON e.payload ->> 'run_id' = s.run_id
           WHERE e.source = 'RELAY-FUEL-INGEST-1'
             AND e.event_class IN (
               'integrations.relay_fuel_ingest_backfill_completed',
               'integrations.relay_fuel_ingest_backfill_failed'
             )
           ORDER BY e.created_at DESC
           LIMIT 1
         )
         SELECT s.run_id,
                CASE WHEN t.event_class LIKE '%_completed' THEN 'completed'
                     WHEN t.event_class LIKE '%_failed' THEN 'failed'
                     ELSE 'running' END AS status,
                s.months,
                s.created_at::text AS started_at,
                t.created_at::text AS completed_at,
                NULLIF(t.payload ->> 'pulled', '')::int AS pulled,
                NULLIF(t.payload ->> 'upserted', '')::int AS upserted,
                NULLIF(t.payload ->> 'skipped', '')::int AS skipped,
                t.payload ->> 'error' AS error
         FROM latest_start s
         LEFT JOIN terminal t ON true`,
        [operatingCompanyId]
      );
      return { operating_company_id: operatingCompanyId, run: result.rows[0] ?? null };
    });
    if (!status) return reply.code(403).send({ error: "forbidden_company_membership" });
    return reply.send(status);
  });

  app.post("/api/integrations/relay/fuel/backfill", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const role = String((req.user as { role?: string } | undefined)?.role ?? "");
    if (!["Owner", "Administrator"].includes(role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const body = req.body as { operating_company_id?: string; months?: number } | undefined;
    const requestedCompanyId = body?.operating_company_id?.trim();
    if (!requestedCompanyId) {
      return reply.code(400).send({ error: "operating_company_id_required" });
    }
    const userId = String((req.user as { uuid?: string } | undefined)?.uuid ?? "");
    const months = Number.isFinite(Number(body?.months)) && Number(body?.months) > 0 ? Number(body?.months) : 24;
    const runId = randomUUID();
    const operatingCompanyId = await withCurrentUser(userId, async (client) => {
      const companyId = await resolveOperatingCompanyId(client, userId, requestedCompanyId);
      if (companyId) {
        await client.query(`SELECT audit.append_event($1, 'info', $2::jsonb, $3::uuid, $4)`, [
          "integrations.relay_fuel_ingest_backfill_started",
          JSON.stringify({ run_id: runId, operating_company_id: companyId, months }),
          userId,
          "RELAY-FUEL-INGEST-1",
        ]);
      }
      return companyId;
    });
    if (!operatingCompanyId) {
      return reply.code(403).send({ error: "forbidden_company_membership" });
    }
    // Fire in the background: pulling N months of transactions per flagged company can exceed the request
    // timeout. Errors are logged (and re-thrown inside runRelayFuelBackfill → audit stream), never swallowed.
    void runRelayFuelBackfill(app, { months, operatingCompanyId, runId }).catch(async (err) => {
      app.log.error({ err }, "[RELAY_FUEL_BACKFILL] backfill failed");
      await withCurrentUser(userId, (client) => client.query(`SELECT audit.append_event($1, 'warning', $2::jsonb, $3::uuid, $4)`, [
        "integrations.relay_fuel_ingest_backfill_failed",
        JSON.stringify({ run_id: runId, operating_company_id: operatingCompanyId, months, error: String((err as Error)?.message ?? err) }),
        userId,
        "RELAY-FUEL-INGEST-1",
      ])).catch((auditErr) => app.log.error({ err: auditErr, run_id: runId }, "[RELAY_FUEL_BACKFILL] terminal audit failed"));
    });
    app.log.info({ months, operating_company_id: operatingCompanyId, triggered_by_role: role }, "[RELAY_FUEL_BACKFILL] backfill started");
    return reply.code(202).send({ status: "relay_fuel_backfill_started", run_id: runId, months, operating_company_id: operatingCompanyId });
  });
}
