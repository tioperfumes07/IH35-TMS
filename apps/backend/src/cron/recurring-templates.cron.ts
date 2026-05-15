import type { FastifyInstance } from "fastify";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { markRunnerFailed, markRunnerInitialized, markRunnerTick } from "../admin/runner-status.store.js";
import { processRecurringTemplatesTick } from "../accounting/recurring.worker.js";

/** Materialize due recurring_templates rows every 15 minutes. */
export function initializeRecurringTemplatesCron(app: FastifyInstance) {
  markRunnerInitialized("recurring_templates");
  setInterval(async () => {
    await wrapBackgroundJobTick(
      "accounting.recurring_templates",
      async () => {
        markRunnerTick("recurring_templates");
        const summary = await processRecurringTemplatesTick(50);
        app.log.info({ recurring_templates: summary }, "[recurring_templates] tick");
      },
      app.log,
      { onError: (error) => markRunnerFailed("recurring_templates", error) }
    );
  }, 15 * 60 * 1000);
}
