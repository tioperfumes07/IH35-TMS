import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runLoadRealDrivenMilesCronTick } from "./load-real-driven-miles.service.js";

let initialized = false;

export function initializeLoadRealDrivenMilesCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_LOAD_REAL_DRIVEN_MILES_CRON === "false") {
    app.log.info("Load real-driven-miles cron disabled via ENABLE_LOAD_REAL_DRIVEN_MILES_CRON=false");
    return;
  }

  // ORDER-2026-09-04: stores real driven miles on each delivered load and leg. Hourly at :25 -- loads deliver
  // a few times a day; the read route computes on demand in between. No-op until migration 202615160000 applies.
  cron.schedule(
    "25 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        "telematics.load_real_driven_miles_cron",
        async () => {
          await runLoadRealDrivenMilesCronTick();
        },
        app.log
      );
    },
    { maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Load real-driven-miles cron scheduled (hourly :25 America/Chicago)");
}
