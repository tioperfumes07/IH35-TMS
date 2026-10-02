/**
 * ENGINE: driver active-30-day rule
 * SCHEDULE: 15 5 * * *
 * WRITES: mdata.drivers status
 * IDEMPOTENCY: SAME-STATEMENT WHERE (status IS DISTINCT FROM 'Inactive' ... / status = 'Inactive' ...)
 * OVERLAP: the twin matches 0 rows
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
/**
 * Daily worker — apply owner 30-day active-driver roster rule per operating company.
 * Migration 202612451400 does the one-shot; this keeps the roster honest going forward.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { applyDriverActive30dRule } from "../mdata/driver-active-30d.service.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

const WORKER_NAME = "mdata.driver_active_30d";
const DEFAULT_INTERVAL = "15 5 * * *"; // 05:15 America/Chicago-ish UTC morning

let initialized = false;

async function tick(app: FastifyInstance) {
  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string; code: string }>(
      `
        SELECT id::text, code
          FROM org.companies
         WHERE deactivated_at IS NULL
           AND COALESCE(is_active, true) = true
         ORDER BY code
         LIMIT 50
      `
    );

    for (const row of companies.rows) {
      const ociId = String(row.id ?? "");
      if (!ociId) continue;
      try {
        assertTenantContext(ociId, WORKER_NAME);
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [ociId]);
        const result = await applyDriverActive30dRule(client, ociId);
        if (result.deactivated > 0 || result.reactivated > 0) {
          app.log.info(
            { ociId, code: row.code, ...result },
            `[${WORKER_NAME}] applied 30d active rule`
          );
        }
      } catch (err) {
        app.log.error({ err, ociId }, `[${WORKER_NAME}] tick error`);
      }
    }
  });
}

export function initializeDriverActive30dWorker(app: FastifyInstance): void {
  if (initialized) return;
  initialized = true;

  const schedule = process.env.DRIVER_ACTIVE_30D_CRON ?? DEFAULT_INTERVAL;

  // ROUND 330.7: through the shared wrapper (run recorded, failure logged + Sentry) so the single-fire lease reaches it.
  cron.schedule(schedule, () => wrapBackgroundJobTick(WORKER_NAME, () => tick(app), app.log), { maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, });

  app.log.info(`[STARTUP] ${WORKER_NAME} initialized (schedule="${schedule}")`);
}
