/**
 * ENGINE: CBP border wait-times refresh
 * SCHEDULE: *\/5 * * * *
 * WRITES: reference.cbp_wait_times_cache (one snapshot per port per tick)
 * IDEMPOTENCY: ADVISORY LOCK pg_try_advisory_xact_lock('border_crossing.cbp_wait_times_refresh') for the tick (lib/single-flight.ts)
 * OVERLAP: an overlapping replica fails the lock and skips; no twin snapshot
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { tryXactSingleFlight } from "../lib/single-flight.js";
import { refreshAllActivePortWaitTimes } from "./cbp-wait-times.service.js";

let initialized = false;

function isBusinessHoursCst(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return hour >= 6 && hour < 22;
}

export async function runCbpWaitTimesRefreshTick() {
  if (!isBusinessHoursCst()) return;
  await withLuciaBypass(async (client) => {
    // ROUND 329: each tick appends one snapshot per port (no business key); the DB lock keeps an overlapping replica
    // from appending a twin snapshot.
    if (!(await tryXactSingleFlight(client, "border_crossing.cbp_wait_times_refresh"))) return;
    await refreshAllActivePortWaitTimes(client);
  });
}

export function initializeCbpWaitTimesRefreshCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_CBP_WAIT_TIMES_CRON === "false") {
    app.log.info("CBP wait times cron disabled via ENABLE_CBP_WAIT_TIMES_CRON=false");
    return;
  }

  cron.schedule(
    "*/5 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        "border_crossing.cbp_wait_times_refresh",
        async () => {
          await runCbpWaitTimesRefreshTick();
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("CBP wait times refresh cron scheduled (every 5 min, 06:00–22:00 America/Chicago)");
}
