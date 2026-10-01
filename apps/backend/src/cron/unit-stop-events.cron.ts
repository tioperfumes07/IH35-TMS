/**
 * ROUND 306 E-03 — stop-odometer capture, scheduled.
 * Every 15 min America/Chicago (RULES R-01), USMCA, after the position poll has had time to land.
 * Idempotent: the writer upserts on (unit_id, started_at). Cost discipline (RULES R-06): one pass
 * over a 36 h window of fixes already on disk; no Samsara call is made by this cron.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { writeUnitStopEvents } from "../telematics/unit-stop-events.writer.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const CRON_NAME = "telematics.unit_stop_events";
let initialized = false;

export function initializeUnitStopEventsCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if ((process.env.UNIT_STOP_EVENTS_CRON_ENABLED ?? "true").trim() === "false") {
    app.log.info(`${CRON_NAME} disabled via UNIT_STOP_EVENTS_CRON_ENABLED=false`);
    return;
  }
  cron.schedule("7,22,37,52 * * * *", async () => {
    await wrapBackgroundJobTick(CRON_NAME, async () => {
      assertTenantContext(USMCA_COMPANY_ID, CRON_NAME);
      const summary = await withLuciaBypass((client) => writeUnitStopEvents(client, USMCA_COMPANY_ID));
      app.log.info(summary, `${CRON_NAME} complete`);
    }, app.log);
  }, { timezone: "America/Chicago", maxRandomDelay: 15_000 });
  app.log.info(`${CRON_NAME} scheduled (every 15 minutes at :07/:22/:37/:52, America/Chicago)`);
}
