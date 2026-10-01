import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runRosterIntegrityCronTick } from "./roster-integrity.service.js";

let initialized = false;

export function initializeRosterIntegrityCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_ROSTER_INTEGRITY_CRON === "false") {
    app.log.info("Fleet roster integrity cron disabled via ENABLE_ROSTER_INTEGRITY_CRON=false");
    return;
  }
  // ROUND 313 E-17: nightly 02:40 America/Chicago (+ on demand from /fleet/roster-integrity).
  cron.schedule(
    "40 2 * * *",
    async () => {
      await wrapBackgroundJobTick("fleet.roster_integrity_cron", async () => { await runRosterIntegrityCronTick(); }, app.log);
    },
    { maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );
  app.log.info("Fleet roster integrity cron scheduled (nightly 02:40 America/Chicago)");
}
