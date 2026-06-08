/**
 * GAP-64 / CAP-14 — Cargo sensor worker (every 5 minutes).
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runCargoSensorIngestionTick } from "../integrations/samsara/cap-14-cargo-sensors/ingester.service.js";
import { processOutOfRangeAlerts } from "../integrations/samsara/cap-14-cargo-sensors/threshold.service.js";

const WORKER_NAME = "dispatch.cap14_cargo_sensor_worker";
const CRON_EXPRESSION = "*/5 * * * *";
const CRON_TZ = "America/Chicago";
let initialized = false;
let task: ReturnType<typeof cron.schedule> | null = null;

export async function runCap14CargoSensorWorkerTick(): Promise<{
  companiesProcessed: number;
  ingested: number;
  alerts: number;
}> {
  const ingestSummary = await runCargoSensorIngestionTick();
  let alerts = 0;

  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT id::text FROM org.companies WHERE is_active = true AND deactivated_at IS NULL`
    );
    for (const row of companies.rows) {
      const operatingCompanyId = String(row.id ?? "");
      if (!operatingCompanyId) continue;
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      const alertResult = await processOutOfRangeAlerts(client, operatingCompanyId);
      alerts += alertResult.incidents;
    }
  });

  return {
    companiesProcessed: ingestSummary.companies_processed,
    ingested: ingestSummary.readings_ingested,
    alerts,
  };
}

export function initializeCap14CargoSensorWorker(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_CAP14_CARGO_SENSOR_WORKER === "false") {
    app.log.info(`[${WORKER_NAME}] disabled via ENABLE_CAP14_CARGO_SENSOR_WORKER=false`);
    return;
  }

  task = cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        WORKER_NAME,
        async () => {
          const summary = await runCap14CargoSensorWorkerTick();
          app.log.info({ summary }, `[${WORKER_NAME}] tick complete`);
        },
        app.log
      );
    },
    { timezone: CRON_TZ }
  );

  app.log.info({ cron: CRON_EXPRESSION, tz: CRON_TZ }, `[${WORKER_NAME}] scheduled`);
}

export function stopCap14CargoSensorWorker() {
  if (!task) return;
  task.stop();
  task = null;
  initialized = false;
}
