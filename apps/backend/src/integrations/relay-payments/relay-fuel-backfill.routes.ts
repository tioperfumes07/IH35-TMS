/**
 * RELAY-FUEL-INGEST-1 (doc 21/23 Part A): owner-triggered ONE-TIME backfill of historical Relay fuel
 * transactions. The daily cron only pulls yesterday; this endpoint runs runRelayFuelBackfill (the exported
 * 24-month backfill) so the owner can seed the full history on demand. Owner/Administrator only. It ingests
 * per-entity ONLY for operating companies whose RELAY_FUEL_INGEST_ENABLED flag is ON (runRelayFuelBackfill
 * enforces this), reads RELAY_API_KEY/RELAY_API_BASE from env, and is STAGING ingest only — writes
 * integrations.relay_fuel_transactions(+lines), posted_to_gl stays false, NO GL / accounting / fuel write.
 * The backfill can take a while (API pull per month per company), so it runs in the background and returns 202.
 */
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session-middleware.js";
import { runRelayFuelBackfill } from "./relay-fuel-ingest.cron.js";

export async function registerRelayFuelBackfillRoute(app: FastifyInstance) {
  app.post("/api/integrations/relay/fuel/backfill", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const role = String((req.user as { role?: string } | undefined)?.role ?? "");
    if (!["Owner", "Administrator"].includes(role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const body = req.body as { months?: number } | undefined;
    const months = Number.isFinite(Number(body?.months)) && Number(body?.months) > 0 ? Number(body?.months) : 24;
    // Fire in the background: pulling N months of transactions per flagged company can exceed the request
    // timeout. Errors are logged (and re-thrown inside runRelayFuelBackfill → audit stream), never swallowed.
    void runRelayFuelBackfill(app, { months }).catch((err) =>
      app.log.error({ err }, "[RELAY_FUEL_BACKFILL] backfill failed")
    );
    app.log.info({ months, triggered_by_role: role }, "[RELAY_FUEL_BACKFILL] backfill started");
    return reply.code(202).send({ status: "relay_fuel_backfill_started", months });
  });
}
