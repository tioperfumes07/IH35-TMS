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
import { hostname } from "node:os";
import { runRelayFuelBackfill } from "./relay-fuel-ingest.cron.js";
import { closeInterruptedBackfillRun, nextIsoDay, readLatestBackfillRun } from "./relay-fuel-backfill-runs.js";

export async function registerRelayFuelBackfillRoute(app: FastifyInstance) {
  app.get("/api/integrations/relay/fuel/backfill/status", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const query = req.query as { operating_company_id?: string } | undefined;
    const requestedCompanyId = query?.operating_company_id?.trim();
    if (!requestedCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });
    const userId = String((req.user as { uuid?: string } | undefined)?.uuid ?? "");
    const status = await withCurrentUser(userId, async (client) => {
      const operatingCompanyId = await resolveOperatingCompanyId(client, userId, requestedCompanyId);
      if (!operatingCompanyId) return null;
      // LEAD 443.126 2b — the one run reader: a run whose worker is gone reads "interrupted" with its last window.
      const run = await readLatestBackfillRun(client, operatingCompanyId);
      return { operating_company_id: operatingCompanyId, run };
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
    const body = req.body as { operating_company_id?: string; months?: number; resume?: boolean } | undefined;
    const requestedCompanyId = body?.operating_company_id?.trim();
    if (!requestedCompanyId) {
      return reply.code(400).send({ error: "operating_company_id_required" });
    }
    const userId = String((req.user as { uuid?: string } | undefined)?.uuid ?? "");
    const months = Number.isFinite(Number(body?.months)) && Number(body?.months) > 0 ? Number(body?.months) : 24;
    const runId = randomUUID();
    // LEAD 443.126 2b — one run per company: a live run refuses a second; a run whose worker is gone is closed as
    // interrupted first; `resume: true` continues from its last committed window + 1 day.
    const start = await withCurrentUser(userId, async (client) => {
      const companyId = await resolveOperatingCompanyId(client, userId, requestedCompanyId);
      if (!companyId) return { kind: "forbidden" as const };
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('relay_fuel_backfill:' || $1))`, [companyId]);
      const latest = await readLatestBackfillRun(client, companyId);
      if (latest?.status === "running") return { kind: "running" as const, run: latest };
      if (latest?.status === "interrupted") await closeInterruptedBackfillRun(client, latest, companyId);
      let resumeFromDate: string | null = null;
      let resumedFrom: string | null = null;
      let runMonths = months;
      if (body?.resume === true) {
        if (latest?.status !== "interrupted") return { kind: "nothing_to_resume" as const, run: latest };
        resumedFrom = latest.run_id;
        runMonths = latest.months;
        resumeFromDate = latest.last_window_end ? nextIsoDay(latest.last_window_end) : null;
      }
      await client.query(`SELECT audit.append_event($1, 'info', $2::jsonb, $3::uuid, $4)`, [
        "integrations.relay_fuel_ingest_backfill_started",
        JSON.stringify({ run_id: runId, operating_company_id: companyId, months: runMonths, resumed_from_run_id: resumedFrom, resume_from_date: resumeFromDate, instance: hostname() }),
        userId,
        "RELAY-FUEL-INGEST-1",
      ]);
      return { kind: "started" as const, companyId, resumeFromDate, resumedFrom, runMonths };
    });
    if (start.kind === "forbidden") return reply.code(403).send({ error: "forbidden_company_membership" });
    if (start.kind === "running") return reply.code(409).send({ error: "relay_fuel_backfill_already_running", run: start.run });
    if (start.kind === "nothing_to_resume") return reply.code(409).send({ error: "relay_fuel_backfill_nothing_to_resume", run: start.run });
    const operatingCompanyId = start.companyId;
    // Fire in the background: pulling N months of transactions per flagged company can exceed the request
    // timeout. Errors are logged (and re-thrown inside runRelayFuelBackfill → audit stream), never swallowed.
    void runRelayFuelBackfill(app, { months: start.runMonths, operatingCompanyId, runId, resumeFromDate: start.resumeFromDate ?? undefined }).catch(async (err) => {
      app.log.error({ err }, "[RELAY_FUEL_BACKFILL] backfill failed");
      await withCurrentUser(userId, (client) => client.query(`SELECT audit.append_event($1, 'warning', $2::jsonb, $3::uuid, $4)`, [
        "integrations.relay_fuel_ingest_backfill_failed",
        JSON.stringify({ run_id: runId, operating_company_id: operatingCompanyId, months, error: String((err as Error)?.message ?? err) }),
        userId,
        "RELAY-FUEL-INGEST-1",
      ])).catch((auditErr) => app.log.error({ err: auditErr, run_id: runId }, "[RELAY_FUEL_BACKFILL] terminal audit failed"));
    });
    app.log.info({ months, operating_company_id: operatingCompanyId, triggered_by_role: role }, "[RELAY_FUEL_BACKFILL] backfill started");
    return reply.code(202).send({ status: "relay_fuel_backfill_started", run_id: runId, months: start.runMonths, operating_company_id: operatingCompanyId, resumed_from_run_id: start.resumedFrom, resume_from_date: start.resumeFromDate });
  });
}
