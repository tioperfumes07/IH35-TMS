/**
 * GAP-64 / CAP-14 — Cargo sensor worker (every 5 minutes).
 */
import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { runCargoSensorIngestionTick } from "../integrations/samsara/cap-14-cargo-sensors/ingester.service.js";
import { processOutOfRangeAlerts } from "../integrations/samsara/cap-14-cargo-sensors/threshold.service.js";

const WORKER_NAME = "dispatch.cap14_cargo_sensor_worker";
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

let timer: NodeJS.Timeout | undefined;

function intervalMs(): number {
  const raw = Number(process.env.CAP14_CARGO_SENSOR_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS));
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS;
}

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
  const ms = intervalMs();
  const run = async () => {
    try {
      const summary = await runCap14CargoSensorWorkerTick();
      app.log.info({ summary }, `[${WORKER_NAME}] tick complete`);
    } catch (err) {
      app.log.error({ err }, `[${WORKER_NAME}] tick failed`);
    }
  };
  void run();
  timer = setInterval(() => void run(), ms);
  app.log.info({ intervalMs: ms }, `[${WORKER_NAME}] started`);
}

export function stopCap14CargoSensorWorker() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
