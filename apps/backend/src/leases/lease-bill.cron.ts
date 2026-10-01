import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runLeaseBillCronTick } from "./lease-bill-engine.service.js";

let initialized = false;

export function initializeLeaseBillCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_LEASE_BILL_CRON === "false") {
    app.log.info("Lease bill cron disabled via ENABLE_LEASE_BILL_CRON=false");
    return;
  }
  // ROUND 316: daily 06:10 America/Chicago for the current month — idempotent per bill key, so the 1st bills the
  // month and every later day only fills what a newly signed / changed contract now owes.
  cron.schedule(
    "10 6 * * *",
    async () => {
      await wrapBackgroundJobTick("leases.monthly_bill_cron", async () => { await runLeaseBillCronTick(); }, app.log);
    },
    { maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );
  app.log.info("Lease bill cron scheduled (daily 06:10 America/Chicago)");
}
