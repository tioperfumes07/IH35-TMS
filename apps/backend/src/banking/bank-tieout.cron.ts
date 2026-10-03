import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { JOB_LEASE_SECONDS, wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runBankTieoutCronTick } from "./bank-tieout.service.js";

let initialized = false;

export function initializeBankTieoutCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_BANK_TIEOUT_CRON === "false") {
    app.log.info("Bank tie-out cron disabled via ENABLE_BANK_TIEOUT_CRON=false");
    return;
  }
  // ROUND 313 BANK-TIEOUT-01: nightly 05:50 America/Chicago (after the 05:40 drift alerts) + live on the register.
  cron.schedule(
    "50 5 * * *",
    async () => {
      await wrapBackgroundJobTick("banking.bank_tieout_cron", async () => { await runBankTieoutCronTick(); }, app.log, { leaseSeconds: JOB_LEASE_SECONDS });
    },
    { maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );
  app.log.info("Bank tie-out cron scheduled (nightly 05:50 America/Chicago)");
}
