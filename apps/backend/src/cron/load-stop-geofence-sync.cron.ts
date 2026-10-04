/**
 * ENGINE: load-stop geofence sync (fence binding + arrival replay + stop stamp)
 * SCHEDULE: 4,19,34,49 * * * *
 * WRITES: geo.geofences, geo.geofence_events, mdata.load_stops actual_arrival_at / geocode, mdata.locations
 * IDEMPOTENCY: ADVISORY LOCK per (load, stop) on fence binding (load-geofence-binding.service.ts) and per location on location + location-fence create (stops-geocode-backfill.service.ts); UNIQUE(operating_company_id, geofence_id, unit_id, event_kind, occurred_at, source) ON CONFLICT on event replay; SAME-STATEMENT WHERE actual_arrival_at IS NULL on the stop stamp; geocode columns are a DETERMINISTIC OVERWRITE
 * OVERLAP: second run binds no twin fence, replays 0 new events, stamps 0 stops (proven ROUND 329 on a throwaway branch: run 1 stamped 1, run 2 stamped 0)
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
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

import { USMCA_COMPANY_ID } from "../org/company-ids.js";
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
