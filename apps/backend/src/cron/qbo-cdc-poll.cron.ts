import type { FastifyInstance } from "fastify";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { markRunnerFailed, markRunnerInitialized, markRunnerTick } from "../admin/runner-status.store.js";

/** CDC poll fallback placeholder — enqueue integrations integration_sync_log from Phase 21 tooling instead of polling here. */
export function initializeQboCdcPollCron(app: FastifyInstance) {
  markRunnerInitialized("qbo_cdc_poll");
  setInterval(async () => {
    await wrapBackgroundJobTick(
      "integrations.qbo_cdc_poll",
      async () => {
        markRunnerTick("qbo_cdc_poll");
      },
      app.log,
      { onError: (error) => markRunnerFailed("qbo_cdc_poll", error) }
    );
  }, 5 * 60 * 1000);
}
