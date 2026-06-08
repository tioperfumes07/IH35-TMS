import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { evaluateRulesForTenant } from "../safety/anomaly/rule-engine.service.js";
import { seedDefaultAnomalyRules } from "../safety/anomaly/seed-default-rules.js";

const WORKER_NAME = "safety.anomaly_detector";
let fastTimer: NodeJS.Timeout | undefined;
let slowTimer: NodeJS.Timeout | undefined;

async function runCadence(app: FastifyInstance, maxCadenceMinutes: number) {
  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL LIMIT 100`
    );
    for (const { id } of companies.rows) {
      try {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [id]);
        await seedDefaultAnomalyRules(client, id);
        const result = await evaluateRulesForTenant(client, id, maxCadenceMinutes);
        app.log.info({ company_id: id, ...result, cadence: maxCadenceMinutes }, `[${WORKER_NAME}] evaluated`);
      } catch (err) {
        app.log.warn({ err, company_id: id }, `[${WORKER_NAME}] failed`);
      }
    }
  });
}

export function initializeAnomalyDetectorWorker(app: FastifyInstance) {
  if (process.env.NODE_ENV === "test") return () => undefined;
  const runFast = () => { void runCadence(app, 30).finally(() => { fastTimer = setTimeout(runFast, 30 * 60 * 1000); }); };
  const runSlow = () => { void runCadence(app, 360).finally(() => { slowTimer = setTimeout(runSlow, 6 * 60 * 60 * 1000); }); };
  fastTimer = setTimeout(runFast, 60_000);
  slowTimer = setTimeout(runSlow, 120_000);
  app.log.info(`[${WORKER_NAME}] initialized`);
  return () => { if (fastTimer) clearTimeout(fastTimer); if (slowTimer) clearTimeout(slowTimer); };
}
