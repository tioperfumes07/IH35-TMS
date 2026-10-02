/**
 * CC-3 queue item 11 — daily copy of every newly observed telematics / geocode fact into the append-only `preserve`
 * ledger (telematics/preservation.service.ts). Runs for every company in one statement per table (company_code is on
 * every preserved row), so it is not tenant-scoped by design: it reads every company's rows under the bypass and writes
 * them keyed by company code. A 3-day window re-covers any missed day; ON CONFLICT DO NOTHING keeps it idempotent.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { preserveTelematics } from "../telematics/preservation.service.js";

const CRON_NAME = "telematics.preservation";
let initialized = false;

export function initializeTelematicsPreservationCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  cron.schedule("10 3 * * *", async () => {
    await wrapBackgroundJobTick(CRON_NAME, async () => {
      const preserved = await withLuciaBypass(async (client) => preserveTelematics(client as never, { sinceDays: 3 }));
      app.log.info({ preserved }, `${CRON_NAME} tick`);
    }, app.log);
  }, { timezone: "America/Chicago", maxRandomDelay: 30_000 });
  app.log.info(`${CRON_NAME} scheduled (daily 03:10 CT)`);
}
