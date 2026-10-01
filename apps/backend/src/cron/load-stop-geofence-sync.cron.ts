/**
 * E-25 (Lead, 2026-10-01) — load-stop geofence sync + retro arrival stamping, scheduled.
 * Every 15 min America/Chicago (RULES R-01), USMCA only, offset from the position poll and the
 * E-03 stop capture so the three never contend. Idempotent: fences are keyed by label, events by
 * their unique index, stamps compare-and-set on NULL. No Samsara call is made here (R-06): it
 * reads positions already on disk.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runLoadStopGeofenceSync } from "../telematics/load-stop-geofence-sync.service.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const CRON_NAME = "telematics.load_stop_geofence_sync";
let initialized = false;

export function initializeLoadStopGeofenceSyncCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if ((process.env.LOAD_STOP_GEOFENCE_SYNC_CRON_ENABLED ?? "true").trim() === "false") {
    app.log.info(`${CRON_NAME} disabled via LOAD_STOP_GEOFENCE_SYNC_CRON_ENABLED=false`);
    return;
  }
  cron.schedule("4,19,34,49 * * * *", async () => {
    await wrapBackgroundJobTick(CRON_NAME, async () => {
      assertTenantContext(USMCA_COMPANY_ID, CRON_NAME);
      const result = await withLuciaBypass(async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);
        return runLoadStopGeofenceSync(client as never, USMCA_COMPANY_ID);
      });
      app.log.info({ operating_company_id: USMCA_COMPANY_ID, ...result }, `${CRON_NAME} complete`);
    }, app.log);
  }, { timezone: "America/Chicago", maxRandomDelay: 20_000 });
  app.log.info(`${CRON_NAME} scheduled (4,19,34,49 * * * * America/Chicago)`);
}
