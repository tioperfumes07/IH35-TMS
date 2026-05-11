import cron from "node-cron";
import type { FastifyInstance } from "fastify";
import { processSyncQueueBatch } from "../integrations/qbo/qbo-sync.service.js";
import { markRunnerFailed, markRunnerInitialized, markRunnerTick } from "../admin/runner-status.store.js";

let runnerStarted = false;

export async function initializeQboSyncQueueRunner(app: FastifyInstance) {
  if (runnerStarted) return;
  runnerStarted = true;
  markRunnerInitialized("sync_queue_runner");
  cron.schedule(
    "* * * * *",
    async () => {
      try {
        markRunnerTick("sync_queue_runner");
        const result = await processSyncQueueBatch(50);
        app.log.info(
          {
            step: "queue_batch_processed",
            processed: result.processed,
            synced: result.synced,
            failed: result.failed,
            blocked: result.blocked,
          },
          "[QBO_SYNC_RUNNER]"
        );
      } catch (error) {
        markRunnerFailed("sync_queue_runner", error);
        app.log.error({ err: error }, "[QBO_SYNC_RUNNER] Fatal error");
      }
    },
    { timezone: "America/Chicago" }
  );
}

