import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runPmAutoEngineCronTick } from "./pm-auto-engine.service.js";

let initialized = false;

export function initializePmAutoEngineCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_PM_AUTO_ENGINE_CRON === "false") {
    app.log.info("PM auto-engine cron disabled via ENABLE_PM_AUTO_ENGINE_CRON=false");
    return;
  }

  cron.schedule(
    "5 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        "maintenance.pm_auto_engine_cron",
        async () => {
          await runPmAutoEngineCronTick();
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("PM auto-engine cron scheduled (hourly at :05 America/Chicago)");
}
