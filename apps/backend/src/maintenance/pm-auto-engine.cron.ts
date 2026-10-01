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

  // E-14 (ORDERS 2026-10-01): ONE run daily at 03:30 America/Chicago, plus a run on manual odometer
  // entry (runPmAutoEngineAfterManualOdometer). PM runs once daily -- cost discipline R-06.
  cron.schedule(
    "30 3 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "maintenance.pm_auto_engine_cron",
        async () => {
          await runPmAutoEngineCronTick();
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("PM auto-engine cron scheduled (daily 03:30 America/Chicago)");
}
