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
import { writeUnitStopEvents, writeUnitStopEventsCatchUp } from "../telematics/unit-stop-events.writer.js";
import { getSamsaraConfigForCompany } from "../integrations/samsara/samsara.service.js";
import { SamsaraClient } from "../integrations/samsara/samsara-client.js";
import { resolveSamsaraApiToken } from "../integrations/samsara/samsara-token.js";
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
  // Daily catch-up over 10 days (02:41 CT, off the :07/:22/:37/:52 ticks): stops a late GPS batch delivered after
  // its 36 h window closed, and every stop before the writer first ran, so E-05 can classify those legs.
  cron.schedule("41 2 * * *", async () => {
    await wrapBackgroundJobTick(`${CRON_NAME}.catch_up`, async () => {
      assertTenantContext(USMCA_COMPANY_ID, CRON_NAME);
      const summary = await withLuciaBypass(async (client) => {
        const cfg = await getSamsaraConfigForCompany(client as never, USMCA_COMPANY_ID);
        const api = cfg && cfg.is_enabled
          ? new SamsaraClient({ apiToken: resolveSamsaraApiToken(cfg as Record<string, unknown>), samsaraOrgId: cfg.samsara_org_id ? String(cfg.samsara_org_id) : null })
          : null;
        return writeUnitStopEventsCatchUp(client, USMCA_COMPANY_ID, 10, new Date(), api ? (ids, a, b) => api.listOdometerHistory(ids, a, b) : undefined);
      });
      app.log.info(summary, `${CRON_NAME}.catch_up complete`);
    }, app.log);
  }, { timezone: "America/Chicago", maxRandomDelay: 15_000 });
  app.log.info(`${CRON_NAME} scheduled (every 15 minutes at :07/:22/:37/:52, America/Chicago; daily 10-day catch-up 02:41)`);
}
