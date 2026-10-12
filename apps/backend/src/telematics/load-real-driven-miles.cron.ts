/**
 * ENGINE: load real-driven miles — per-stop leg miles and per-load total from odometer captures.
 * SCHEDULE: hourly :25 America/Chicago (node-cron).
 * WRITES: mdata.load_stops (leg_miles_driven_actual*) · mdata.loads (miles_driven_actual*) — UPDATE only, no INSERT
 *   (load-real-driven-miles.service.ts:251, :258).
 * IDEMPOTENCY: DETERMINISTIC OVERWRITE — each UPDATE sets a computed column to a pure function of the captures; no
 *   history or recalculation-log row is inserted.
 * OVERLAP: one instance per tick (job lease, 443.103); a row is written only when a computed value changed, so a
 *   repeat run writes nothing.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { JOB_LEASE_SECONDS, wrapBackgroundJobTick } from "../lib/background-jobs.js";
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
        app.log,
        // 443.103: one instance per tick. Without the lease every instance ran the tick (2 passes an hour, 3-4 around a
        // deploy), each rewriting every due load.
        { leaseSeconds: JOB_LEASE_SECONDS }
      );
    },
    { maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Load real-driven-miles cron scheduled (hourly :25 America/Chicago)");
}
