import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
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
    { timezone: "America/Chicago" }
  );

  app.log.info("CBP wait times refresh cron scheduled (every 5 min, 06:00–22:00 America/Chicago)");
}
