import type { FastifyInstance } from "fastify";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { markRunnerFailed, markRunnerInitialized, markRunnerTick } from "../admin/runner-status.store.js";

/** Stub scheduler — advances due recurring_templates rows when wired (Wave 2 expansion). */
export function initializeRecurringTemplatesCron(app: FastifyInstance) {
  markRunnerInitialized("recurring_templates");
  setInterval(async () => {
    await wrapBackgroundJobTick(
      "accounting.recurring_templates",
      async () => {
        markRunnerTick("recurring_templates");
      },
      app.log,
      { onError: (error) => markRunnerFailed("recurring_templates", error) }
    );
  }, 15 * 60 * 1000);
}
