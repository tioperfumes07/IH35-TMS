/**
 * ENGINE: active driver set recompute
 * SCHEDULE: *\/15 * * * *
 * WRITES: active_driver_set_cache (one snapshot per run)
 * IDEMPOTENCY: ADVISORY LOCK pg_try_advisory_xact_lock(WORKER_NAME) for the tick
 * OVERLAP: the twin fails the lock and writes no second snapshot
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
/**
 * GAP-25 — Active Driver Set Recompute Worker
 *
 * Runs every 15 minutes for each active operating company with Samsara enabled.
 * Recomputes the active-driver set at threshold_days 7, 14, and 30 so all
 * SafetyHome filter options have a warm cache entry.
 *
 * Uses lucia bypass so RLS does not block cross-company iteration.
 */

import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { recomputeActiveDriverSet } from "../integrations/samsara/active-driver-set/recompute.service.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { tryXactSingleFlight } from "../lib/single-flight.js";

const WORKER_NAME = "samsara.active_driver_set_recompute";
const DEFAULT_INTERVAL = "*/15 * * * *"; // every 15 minutes
const THRESHOLD_DAYS_LIST = [7, 14, 30] as const;

let initialized = false;

async function tick(app: FastifyInstance) {
  await withLuciaBypass(async (client) => {
    // ROUND 330.7: one snapshot per run is intended, but the twin instance wrote a second one. One tick at a time.
    if (!(await tryXactSingleFlight(client, WORKER_NAME))) return;
    const companies = await client.query<{ id: string }>(
      `
        SELECT c.id::text
        FROM org.companies c
        JOIN integrations.samsara_config sc ON sc.operating_company_id = c.id
        WHERE c.is_active = true
          AND c.deactivated_at IS NULL
          AND sc.is_enabled = true
        ORDER BY c.id
        LIMIT 200
      `
    );

    for (const row of companies.rows) {
      const ociId = String(row.id ?? "");
      if (!ociId) continue;

      try {
        assertTenantContext(ociId, WORKER_NAME);

        for (const days of THRESHOLD_DAYS_LIST) {
          try {
            await recomputeActiveDriverSet(client, ociId, days);
          } catch (err) {
            app.log.warn(
              { err, ociId, days },
              `[${WORKER_NAME}] recompute failed for oci=${ociId} threshold=${days}d`
            );
          }
        }

        app.log.debug(
          { ociId },
          `[${WORKER_NAME}] recomputed active driver sets for oci=${ociId}`
        );
      } catch (err) {
        app.log.error(
          { err, ociId },
          `[${WORKER_NAME}] tick error for oci=${ociId}`
        );
      }
    }
  });
}

export function initializeActiveDriverSetRecomputeWorker(app: FastifyInstance): void {
  if (initialized) return;
  initialized = true;

  const schedule = process.env.ACTIVE_DRIVER_SET_CRON ?? DEFAULT_INTERVAL;

  // ROUND 330.7: through the shared wrapper (run recorded, failure logged + Sentry) so the single-fire lease reaches it.
  cron.schedule(schedule, () => wrapBackgroundJobTick(WORKER_NAME, () => tick(app), app.log), { maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, });

  app.log.info(`[STARTUP] ${WORKER_NAME} initialized (schedule="${schedule}")`);
}
