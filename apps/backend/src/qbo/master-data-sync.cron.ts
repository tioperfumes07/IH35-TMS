import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { runScheduledMasterDataSync } from "./master-data-sync.service.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

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
      await wrapBackgroundJobTick(
        "qbo.master_data_sync.full",
        async () => {
          app.log.info("QBO master-data FULL sync cron tick (America/Chicago)");
          await runScheduledMasterDataSync("full");
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  cron.schedule(
    "*/15 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        "qbo.master_data_sync.delta",
        async () => {
          await runScheduledMasterDataSync("delta");
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("QBO master-data sync cron initialized (02:00 CT full, every 15m delta)");
}
