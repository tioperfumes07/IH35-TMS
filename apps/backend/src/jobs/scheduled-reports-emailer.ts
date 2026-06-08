/**
 * GAP-43 — Scheduled reports emailer worker.
 * Runs every 15 minutes to honor daily 5am cadences and other Q8 schedules.
 */

import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runDue } from "../reports/scheduled/runner.service.js";

const WORKER_NAME = "reports.scheduled_reports_emailer";

let initialized = false;

export async function runScheduledReportsEmailerTick(): Promise<void> {
  await runDue();
}

export function initializeScheduledReportsEmailer(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_SCHEDULED_REPORTS_EMAILER === "false") {
    app.log.info("Scheduled reports emailer disabled via ENABLE_SCHEDULED_REPORTS_EMAILER=false");
    return;
  }

  cron.schedule(
    "*/15 * * * *",
    async () => {
      await wrapBackgroundJobTick(WORKER_NAME, async () => {
        const summary = await runDue();
        app.log.info({ summary }, `[${WORKER_NAME}] tick complete`);
      }, app.log);
    },
    { timezone: "America/Chicago" }
  );

  app.log.info(`[${WORKER_NAME}] initialized — cron */15 * * * * (America/Chicago)`);
}
