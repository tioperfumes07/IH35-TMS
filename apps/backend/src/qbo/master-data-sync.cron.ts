import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { runScheduledMasterDataSync } from "./master-data-sync.service.js";

let initialized = false;

export async function initializeMasterDataSyncCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if ((process.env.QBO_MASTERDATA_SYNC_ENABLED ?? "").trim() !== "true") {
    app.log.info("QBO master-data sync cron disabled (set QBO_MASTERDATA_SYNC_ENABLED=true to enable)");
    return;
  }

  cron.schedule(
    "0 2 * * *",
    async () => {
      app.log.info("QBO master-data FULL sync cron tick (America/Chicago)");
      try {
        await runScheduledMasterDataSync("full");
      } catch (error) {
        app.log.error({ err: error }, "QBO master-data full sync cron failed");
      }
    },
    { timezone: "America/Chicago" }
  );

  cron.schedule(
    "*/15 * * * *",
    async () => {
      try {
        await runScheduledMasterDataSync("delta");
      } catch (error) {
        app.log.error({ err: error }, "QBO master-data delta sync cron failed");
      }
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("QBO master-data sync cron initialized (02:00 CT full, every 15m delta)");
}
