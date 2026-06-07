import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { wrapBackgroundJobTick } from "../../../lib/background-jobs.js";
import { clearTier3FiveMinutesCache, fetchTier3FiveMinutes } from "./tier3-5min.js";
import { clearTier4FifteenMinutesCache, fetchTier4FifteenMinutes } from "./tier4-15min.js";

let initialized = false;

export async function warmTier3Caches(): Promise<number> {
  clearTier3FiveMinutesCache();
  const keys = ["vehicle-stats", "driver-clocks"];
  for (const key of keys) {
    await fetchTier3FiveMinutes(`warm:${key}`, async () => ({ warmed_at: new Date().toISOString(), key }));
  }
  return keys.length;
}

export async function warmTier4Caches(): Promise<number> {
  clearTier4FifteenMinutesCache();
  const keys = ["weekly-scoring", "aggregate-stats"];
  for (const key of keys) {
    await fetchTier4FifteenMinutes(`warm:${key}`, async () => ({ warmed_at: new Date().toISOString(), key }));
  }
  return keys.length;
}

export function initializeSamsaraCacheWarmer(app: FastifyInstance): void {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_SAMSARA_CACHE_WARMER === "false") {
    app.log.info("Samsara cache warmer disabled via ENABLE_SAMSARA_CACHE_WARMER=false");
    return;
  }

  cron.schedule(
    "*/5 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        "samsara.cache_warmer.tier3",
        async () => {
          const warmed = await warmTier3Caches();
          app.log.info({ warmed }, "[samsara-cache-warmer] tier3 warm complete");
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
        "samsara.cache_warmer.tier4",
        async () => {
          const warmed = await warmTier4Caches();
          app.log.info({ warmed }, "[samsara-cache-warmer] tier4 warm complete");
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Samsara cache warmer scheduled (tier3 */5min, tier4 */15min America/Chicago)");
}
