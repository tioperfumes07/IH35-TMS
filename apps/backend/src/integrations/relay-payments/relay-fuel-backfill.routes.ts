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
import { requireAuth } from "../../auth/session-middleware.js";
import { withCurrentUser } from "../../auth/db.js";
import { resolveOperatingCompanyId } from "../../auth/operating-company-scope.js";
import { runRelayFuelBackfill } from "./relay-fuel-ingest.cron.js";

export async function registerRelayFuelBackfillRoute(app: FastifyInstance) {
  app.post("/api/integrations/relay/fuel/backfill", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return;
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
    const operatingCompanyId = await withCurrentUser(userId, (client) =>
      resolveOperatingCompanyId(client, userId, requestedCompanyId)
    );
    if (!operatingCompanyId) {
      return reply.code(403).send({ error: "forbidden_company_membership" });
    }
    const months = Number.isFinite(Number(body?.months)) && Number(body?.months) > 0 ? Number(body?.months) : 24;
    // Fire in the background: pulling N months of transactions per flagged company can exceed the request
    // timeout. Errors are logged (and re-thrown inside runRelayFuelBackfill → audit stream), never swallowed.
    void runRelayFuelBackfill(app, { months, operatingCompanyId }).catch((err) =>
      app.log.error({ err }, "[RELAY_FUEL_BACKFILL] backfill failed")
    );
    app.log.info({ months, operating_company_id: operatingCompanyId, triggered_by_role: role }, "[RELAY_FUEL_BACKFILL] backfill started");
    return reply.code(202).send({ status: "relay_fuel_backfill_started", months, operating_company_id: operatingCompanyId });
  });
}
