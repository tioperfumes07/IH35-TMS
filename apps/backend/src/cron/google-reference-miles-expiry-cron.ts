import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { expireStaleGoogleReferenceMiles } from "../dispatch/google-reference-miles.service.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

let initialized = false;

/**
 * DSP-48 (Google ToS: cached route data may not be retained past 30 days). Nulls
 * mdata.load_stop_legs.google_reference_miles/google_reference_fetched_at on rows older than
 * 30 days -- degrade-safe no-op until CC-1's migration lands (docs/bus/INBOX-CC-1.md).
 */
export async function runGoogleReferenceMilesExpiryTick(app: FastifyInstance): Promise<void> {
  const { expired } = await withLuciaBypass(async (client) => expireStaleGoogleReferenceMiles(client));
  if (expired > 0) {
    app.log.info({ count: expired }, "mdata.load_stop_legs google_reference_miles expired by cron");
  }
}

export function initializeGoogleReferenceMilesExpiryCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_GOOGLE_REFERENCE_MILES_EXPIRY_CRON === "false") {
    app.log.info("Google reference miles expiry cron disabled via ENABLE_GOOGLE_REFERENCE_MILES_EXPIRY_CRON=false");
    return;
  }

  cron.schedule(
    "40 6 * * *",
    async () => {
      await wrapBackgroundJobTick("google_reference_miles.expiry_cron", async () => {
        await runGoogleReferenceMilesExpiryTick(app);
      }, app.log);
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Google reference miles expiry cron scheduled (daily 06:40 America/Chicago)");
}
