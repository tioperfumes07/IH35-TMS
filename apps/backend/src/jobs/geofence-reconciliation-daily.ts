/**
 * GAP-27 — Daily geofence reconciliation worker.
 * Runs at 02:00 CT each day for all active companies.
 */
import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { runDailyReconciliation } from "../integrations/samsara/geofences/reconciliation.service.js";

const WORKER_NAME = "safety.geofence_reconciliation_daily";

let cronTimer: NodeJS.Timeout | undefined;

function msUntilNext2amCT(): number {
  const now = new Date();
  // 2am CT = 8am UTC (approximating CT as UTC-6)
  const utcHour = (2 + 6) % 24;
  const next = new Date(now);
  next.setUTCHours(utcHour, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

async function runReconciliation(app: FastifyInstance) {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL LIMIT 100`
    ).catch(() => ({ rows: [] as { id: string }[] }));

    let total = 0;
    for (const { id } of companies.rows) {
      try {
        const result = await runDailyReconciliation(client, id, yesterday);
        total += result.anomalies_found;
      } catch (err) {
        app.log.warn({ err, company_id: id }, `[${WORKER_NAME}] reconciliation failed for company`);
      }
    }
    app.log.info({ date: yesterday, total_anomalies: total }, `[${WORKER_NAME}] daily reconciliation complete`);
  });
}

export function initializeGeofenceReconciliationWorker(app: FastifyInstance) {
  const scheduleNext = () => {
    const ms = process.env.NODE_ENV === "test" ? 0 : msUntilNext2amCT();
    app.log.info({ nextRunMs: ms }, `[${WORKER_NAME}] scheduled`);
    cronTimer = setTimeout(async () => {
      try {
        await runReconciliation(app);
      } catch (err) {
        app.log.error({ err }, `[${WORKER_NAME}] run failed`);
      }
      scheduleNext();
    }, ms);
  };

  if (process.env.NODE_ENV !== "test") scheduleNext();
  app.log.info(`[${WORKER_NAME}] initialized`);

  return () => {
    if (cronTimer) {
      clearTimeout(cronTimer);
      cronTimer = undefined;
    }
  };
}
